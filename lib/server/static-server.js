'use strict';

/**
 * @typedef { import("../reloader/index.js").reloadServer } reloadServer
 * @typedef { import("../utils/watch.js").watcher } watcher
 */
/**
 * @typedef { object } staticServer
 * @property { () => Promise<void> } destroy
 * @property { number } port
 */

const { destroyClients } = require('../push-events/index.js');
const { find, getProjectPath } = require('../utils/file.js');
const {
  handleMockResponse,
  handleMockWebSocket,
  handlePushEvent
} = require('./common.js');
const { info, noisyInfo } = require('../utils/log.js');
const {
  isHtmlRequest,
  isModuleBundlerFilePath,
  isProjectFilePath
} = require('../utils/is.js');
const { bundle } = require('../bundler/index.js');
const chalk = require('chalk');
const config = require('../config.js');
const debug = require('debug')('dvlp:static');
const decorateWithServerDestroy = require('server-destroy');
const http = require('http');
const { interceptFileRead } = require('../utils/intercept.js');
const Mock = require('../mock/index.js');
const { patchResponse } = require('../utils/patch.js');
const path = require('path');
const send = require('send');
const stopwatch = require('../utils/stopwatch.js');
const transpile = require('../utils/transpile.js');
const watch = require('../utils/watch.js');

/**
 * Create static server
 *
 * @param { object } [options]
 * @param { string } [options.mockPath]
 * @param { number } [options.port]
 * @param { reloadServer } [options.reloader]
 * @param { object } [options.rollupConfig]
 * @param { (filePath: string, isServer: boolean) => Promise<string> | string | undefined } [options.transpiler]
 * @param { boolean } [options.watchDeps]
 * @returns { staticServer }
 */
module.exports = async function staticServer({
  mockPath,
  port,
  reloader,
  rollupConfig,
  transpiler,
  watchDeps
} = {}) {
  const server = new StaticServer(
    port,
    reloader,
    rollupConfig,
    transpiler,
    mockPath,
    watchDeps
  );

  await server.start();

  info(
    `\n  💥 Serving ${chalk.green(
      config.directories
        .map((dir) => getProjectPath(dir) || 'project')
        .join(', ')
    )} at ${chalk.green.underline(`http://localhost:${port}`)}`
  );

  return {
    port,
    destroy: server.destroy.bind(server)
  };
};

class StaticServer {
  /**
   * Constructor
   *
   * @param { number } port
   * @param { reloadServer } [reloader]
   * @param { object } [rollupConfig]
   * @param { (filePath: string, isServer: boolean) => Promise<string> | string | undefined } [transpiler]
   * @param { string } [mockPath]
   * @param { boolean } [watchDeps]
   */
  constructor(port, reloader, rollupConfig, transpiler, mockPath, watchDeps) {
    this.lastChanged = '';
    this.mocks = mockPath && new Mock(mockPath);
    this.patchResponseOptions = {
      rollupConfig,
      footerScript: {
        string: reloader && reloader.client
      },
      headerScript: {
        string: mockPath && this.mocks.client
      }
    };
    this.port = port;
    this.origin = `http://localhost:${port}`;
    this.reloader = reloader;
    this.rollupConfig = rollupConfig;
    this.server = null;
    this.transpiler = transpiler;
    this.transpilerCache = transpiler && new Map();

    if (reloader) {
      this.watcher = this.createWatcher();
      // Listen for all upcoming file system reads (including require('*'))
      this.unlistenForFileRead = interceptFileRead((filePath) => {
        if (isProjectFilePath(filePath, watchDeps)) {
          this.watcher.add(filePath, watchDeps);
        }
      });
    }
  }

  /**
   * Create watcher instance and listen for file changes
   *
   * @returns { watcher }
   */
  createWatcher() {
    return watch((filePath) => {
      noisyInfo(
        `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(
          getProjectPath(filePath)
        )}`
      );

      this.lastChanged = filePath;

      // Will trigger one of:
      // 1. single css refresh if css and a link.href matches filePath
      // 2. multiple css refreshes if css and no link.href matches filePath (ie. it's a dependency)
      // 3. full page reload
      this.reloader.send(`/${path.relative(process.cwd(), filePath)}`);
    });
  }

  /**
   * Start server
   *
   * @returns { Promise<void> }
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        stopwatch.start(req.url);

        const url = req.url;
        let filePath;

        res.url = req.url;

        if (
          handleMockResponse(req, res, this.mocks) ||
          handlePushEvent(req, res, this.mocks)
        ) {
          return;
        }

        res.once('finish', () => {
          const duration = stopwatch.stop(url, true, true);
          const reroute =
            url !== req.url ? `(re-routed to ${chalk.green(req.url)})` : '';

          // 'transpiled' is added by transpile utility if handled there
          if (!res.transpiled) {
            info(
              res.statusCode < 300
                ? `${duration} handled request for ${chalk.green(
                    url
                  )} ${reroute}`
                : `${duration} [${
                    res.statusCode
                  }] unhandled request for ${chalk.red(url)} ${reroute}`
            );
          }
        });

        filePath = find(req);

        if (filePath) {
          if (isModuleBundlerFilePath(filePath)) {
            await bundle(
              path.basename(filePath),
              undefined,
              undefined,
              this.rollupConfig
            );
          }
        } else {
          // Re-write to root index.html
          if (isHtmlRequest(req)) {
            req.url = '/';
            filePath = find(req);
          }
        }

        if (!filePath) {
          debug(`not found "${req.url}"`);
          res.writeHead('404');
          return res.end();
        }

        patchResponse(filePath, req, res, this.patchResponseOptions);

        this.watcher && this.watcher.add(filePath);
        this.transpiler &&
          (await transpile(filePath, res, {
            transpilerCache: this.transpilerCache,
            lastChanged: this.lastChanged,
            transpiler: this.transpiler
          }));

        // Not transpiled
        if (!res.finished) {
          debug(`sending "${filePath}"`);
          return send(req, filePath, {
            cacheControl: true,
            dotfiles: 'allow',
            maxAge: config.maxAge
          }).pipe(res);
        }
      });

      this.server.keepAliveTimeout = 0;
      decorateWithServerDestroy(this.server);

      this.server.on('error', reject);
      this.server.on('listening', resolve);
      this.server.on('upgrade', (req, socket, body) => {
        handleMockWebSocket(req, socket, body, this.mocks);
      });

      this.server.listen(this.port);
    });
  }

  /**
   * Stop running server
   *
   * @returns { Promise<void> }
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.server) {
        return resolve();
      }

      this.server.removeAllListeners();
      this.server.destroy(() => {
        debug('server stopped');
        resolve();
      });
    });
  }

  /**
   * Destroy instance
   *
   * @returns { Promise<void> }
   */
  destroy() {
    debug('destroying');
    destroyClients();
    if (this.watcher) {
      this.unlistenForFileRead();
      this.watcher.close();
    }
    return this.stop();
  }
}
