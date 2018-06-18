'use strict';

const { find, getProjectPath } = require('./utils/file');
const { info } = require('./utils/log');
const { patchResponse } = require('./utils/patch');
const chalk = require('chalk');
const debug = require('debug')('dvlp:static');
const decorateWithServerDestroy = require('server-destroy');
const http = require('http');
const path = require('path');
const send = require('send');
const stopwatch = require('./utils/stopwatch');
const transpile = require('./utils/transpile');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ port: number, reloader: { client: string, send: (string, object) => void, destroy: () => Promise<void> }, rollupConfig: object, transpiler: (string) => string }} [options]
 * @returns {{ destroy: () => Promise<void> }}
 */
module.exports = async function staticServer(
  webroot = process.cwd(),
  { port = DEFAULT_PORT, reloader, rollupConfig, transpiler } = {}
) {
  const directories = (Array.isArray(webroot) ? webroot : [webroot]).map((directory) =>
    path.resolve(directory)
  );
  const instance = new StaticServer(directories, port, reloader, rollupConfig, transpiler);

  await instance.start();

  info(
    `💥 Serving ${chalk.green(
      directories.map((dir) => getProjectPath(dir) || 'project').join(', ')
    )} at ${chalk.green.underline(`http://localhost:${port}`)}`
  );

  return {
    destroy: instance.destroy.bind(instance)
  };
};

class StaticServer {
  /**
   * Constructor
   * @param {[string]} directories
   * @param {number} port
   * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }} [reloader]
   * @param {object} [rollupConfig]
   * @param {(string) => string} [transpiler]
   */
  constructor(directories, port, reloader, rollupConfig, transpiler) {
    this.filepathToTranspiled = new Map();
    this.fileOptions = {
      directories,
      rollupConfig,
      scriptString: reloader && reloader.client
    };
    this.lastChanged = '';
    this.port = port;
    this.reloader = reloader;
    this.server = null;
    this.transpiler = transpiler;
    this.watcher = reloader ? this.createWatcher() : null;
  }

  /**
   * Create watcher instance and listen for file changes
   * @returns {object}
   */
  createWatcher() {
    return watch((filepath) => {
      info(`\n⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(getProjectPath(filepath))}`);
      this.lastChanged = filepath;
      this.reloader.send(filepath);
    });
  }

  /**
   * Start server
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        stopwatch.start(req.url);
        let filepath;

        try {
          // Triggers bundling
          filepath = await find(req, this.fileOptions);
        } catch (err) {
          debug(`not found "${req.url}"`);
          res.writeHead('404');
          return res.end();
        }

        res.once('finish', () => {
          info(
            `${stopwatch.stop(req.url, true, true)} handled request for ${chalk.green(req.url)}`
          );
        });

        patchResponse(req, res, this.fileOptions);

        this.watcher && this.watcher.add(filepath);
        this.transpiler &&
          (await transpile(filepath, res, {
            filepathToTranspiled: this.filepathToTranspiled,
            lastChanged: this.lastChanged,
            transpiler: this.transpiler
          }));

        // Not transpiled
        if (!res.finished) {
          debug(`sending "${filepath}"`);
          return send(req, filepath, {
            cacheControl: false,
            dotfiles: 'allow'
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
   * @returns {Promise<void>}
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
