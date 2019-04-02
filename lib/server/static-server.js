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

const { find, getProjectPath } = require('../utils/file.js');
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
const { URL } = require('url');

/**
 * Create static server
 *
 * @param { string | Array<string> } webroot
 * @param { object } [options]
 * @param { string } [options.mockPath]
 * @param { number } [options.port]
 * @param { reloadServer } [options.reloader]
 * @param { object } [options.rollupConfig]
 * @param { (string) => string } [options.transpiler]
 * @returns { staticServer }
 */
module.exports = async function staticServer(
  webroot = process.cwd(),
  { mockPath, port, reloader, rollupConfig, transpiler } = {}
) {
  const directories = (Array.isArray(webroot) ? webroot : [webroot]).map(
    (directory) => path.resolve(directory)
  );
  const server = new StaticServer(
    directories,
    port,
    reloader,
    rollupConfig,
    transpiler,
    mockPath
  );

  // Force include cwd in search path
  if (!directories.includes(process.cwd())) {
    directories.push(process.cwd());
  }

  await server.start();

  info(
    `\n  💥 Serving ${chalk.green(
      directories.map((dir) => getProjectPath(dir) || 'project').join(', ')
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
   * @param { Array<string> } directories
   * @param { number } port
   * @param { reloadServer } [reloader]
   * @param { object } [rollupConfig]
   * @param { (string) => string } [transpiler]
   * @param { string } [mockPath]
   */
  constructor(directories, port, reloader, rollupConfig, transpiler, mockPath) {
    this.findFileOptions = {
      directories
    };
    this.lastChanged = '';
    this.mock = mockPath && new Mock(mockPath);
    this.patchResponseOptions = {
      rollupConfig,
      footerScript: {
        string: reloader && reloader.client
      },
      headerScript: {
        string: mockPath && this.mock.client
      },
      ...this.findFileOptions
    };
    this.port = port;
    this.reloader = reloader;
    this.rollupConfig = rollupConfig;
    this.server = null;
    this.transpiler = transpiler;
    this.transpilerCache = transpiler && new Map();

    if (reloader) {
      this.watcher = this.createWatcher();
      // Listen for all upcoming file system reads (including require('*'))
      this.unlistenForFileRead = interceptFileRead((filePath) => {
        if (isProjectFilePath(filePath)) {
          this.watcher.add(filePath);
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
      this.reloader.send(filePath);
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
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const mocked = url.searchParams.get('mock');
        let filePath;

        stopwatch.start(url.href);

        res.url = req.url;

        if (mocked) {
          this.mock.match(mocked, res);
          return;
        }

        res.once('finish', () => {
          const duration = stopwatch.stop(url.href, true, true);
          const reroute =
            url.pathname !== req.url
              ? `(re-routed to ${chalk.green(req.url)})`
              : '';

          // 'transpiled' is added by transpile utility if handled there
          if (!res.transpiled) {
            info(
              res.statusCode < 300
                ? `${duration} handled request for ${chalk.green(
                    url.pathname
                  )} ${reroute}`
                : `${duration} [${
                    res.statusCode
                  }] unhandled request for ${chalk.red(url)} ${reroute}`
            );
          }
        });

        try {
          filePath = find(req, this.findFileOptions);
          if (isModuleBundlerFilePath(filePath)) {
            await bundle(path.basename(filePath), undefined, this.rollupConfig);
          }
        } catch (err) {
          // Re-write to root index.html
          if (isHtmlRequest(req)) {
            req.url = '/';
            try {
              filePath = find(req, this.findFileOptions);
            } catch (err) {
              /* ignore */
            }
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
    if (this.watcher) {
      this.unlistenForFileRead();
      this.watcher.close();
    }
    return this.stop();
  }
}
