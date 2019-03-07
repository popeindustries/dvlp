'use strict';

const { find, getProjectPath } = require('./utils/file.js');
const { bundle } = require('./bundler/bundle.js');
const chalk = require('chalk');
const debug = require('debug')('dvlp:static');
const decorateWithServerDestroy = require('server-destroy');
const http = require('http');
const { info, noisyInfo } = require('./utils/log.js');
const { isHtmlRequest, isModuleBundlerFilePath } = require('./utils/is.js');
const { maxAge } = require('./config.js');
const { patchResponse } = require('./utils/patch.js');
const path = require('path');
const send = require('send');
const stopwatch = require('./utils/stopwatch.js');
const transpile = require('./utils/transpile.js');
const watch = require('./utils/watch.js');

/**
 * Create static server
 *
 * @param { string | Array<string> } webroot
 * @param { { port: number, reloader: { client: string, send: (string, object) => void, destroy: () => Promise<void> }, rollupConfig: object, transpiler: (string) => string } } [options]
 * @returns { { destroy: () => Promise<void> } }
 */
module.exports = async function staticServer(
  webroot = process.cwd(),
  { port, reloader, rollupConfig, transpiler } = {}
) {
  const directories = (Array.isArray(webroot) ? webroot : [webroot]).map(
    (directory) => path.resolve(directory)
  );
  const instance = new StaticServer(
    directories,
    port,
    reloader,
    rollupConfig,
    transpiler
  );

  // Force include cwd in search path
  if (!directories.includes(process.cwd())) {
    directories.push(process.cwd());
  }

  await instance.start();

  info(
    `\n  💥 Serving ${chalk.green(
      directories.map((dir) => getProjectPath(dir) || 'project').join(', ')
    )} at ${chalk.green.underline(`http://localhost:${port}`)}`
  );

  return {
    port,
    destroy: instance.destroy.bind(instance)
  };
};

class StaticServer {
  /**
   * Constructor
   *
   * @param { Array<string> } directories
   * @param { number } port
   * @param { { client: string, send: (string, object) => void, destroy: () => Promise<void> } } [reloader]
   * @param { object } [rollupConfig]
   * @param { (string) => string } [transpiler]
   */
  constructor(directories, port, reloader, rollupConfig, transpiler) {
    this.filePathToTranspiled = new Map();
    this.findFileOptions = {
      directories,
      scriptString: reloader && reloader.client
    };
    this.lastChanged = '';
    this.patchResponseOptions = { rollupConfig, ...this.findFileOptions };
    this.port = port;
    this.reloader = reloader;
    this.rollupConfig = rollupConfig;
    this.server = null;
    this.transpiler = transpiler;
    this.watcher = reloader ? this.createWatcher() : null;
  }

  /**
   * Create watcher instance and listen for file changes
   *
   * @returns { object }
   */
  createWatcher() {
    return watch((filePath) => {
      noisyInfo(
        `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(
          getProjectPath(filePath)
        )}`
      );
      this.lastChanged = filePath;
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
        const url = req.url;
        let filePath;

        stopwatch.start(url);

        res.once('finish', () => {
          const duration = stopwatch.stop(url, true, true);
          const reroute =
            url !== req.url ? `(re-routed to ${chalk.green(req.url)})` : '';

          info(
            res.statusCode < 300
              ? `${duration} handled request for ${chalk.green(url)} ${reroute}`
              : `${duration} [${
                  res.statusCode
                }] unhandled request for ${chalk.red(url)} ${reroute}`
          );
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
            filePathToTranspiled: this.filePathToTranspiled,
            lastChanged: this.lastChanged,
            transpiler: this.transpiler
          }));

        // Not transpiled
        if (!res.finished) {
          debug(`sending "${filePath}"`);
          return send(req, filePath, {
            cacheControl: true,
            dotfiles: 'allow',
            maxAge
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
   */
  destroy() {
    debug('destroying');
    this.watcher && this.watcher.close();
    return this.stop();
  }
}
