'use strict';

const { find, getProjectPath } = require('./utils/file');
const { bundle } = require('./utils/bundler');
const chalk = require('chalk');
const debug = require('debug')('dvlp:static');
const decorateWithServerDestroy = require('server-destroy');
const { hackResponse } = require('./utils/hack');
const http = require('http');
const { info } = require('./utils/log');
const { isModuleBundlerFilepath } = require('./utils/is');
const mock = require('./utils/mock');
const path = require('path');
const send = require('send');
const stopwatch = require('./utils/stopwatch');
const transpile = require('./utils/transpile');
const watch = require('./utils/watch');

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ port: number, reloader: { client: string, send: (string, object) => void, destroy: () => Promise<void> }, rollupConfig: object, transpiler: (string) => string }} [options]
 * @returns {{ destroy: () => Promise<void> }}
 */
module.exports = async function staticServer(
  webroot = process.cwd(),
  { port, reloader, rollupConfig, transpiler } = {}
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
    this.findFileOptions = {
      directories,
      scriptString: reloader && reloader.client
    };
    this.lastChanged = '';
    this.hackResponseOptions = { rollupConfig, ...this.findFileOptions };
    this.port = port;
    this.reloader = reloader;
    this.rollupConfig = rollupConfig;
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
      info(`\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(getProjectPath(filepath))}`);
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

        res.once('finish', () => {
          const time = stopwatch.stop(req.url, true, true);

          info(
            res.statusCode > 300
              ? `${time} handled request for ${chalk.green(req.url)}`
              : `${time} [${res.statusCode}] unhandled request for ${chalk.red(req.url)}`
          );
        });

        if (mock.match(req, res)) {
          return;
        }

        try {
          filepath = find(req, this.findFileOptions);
          if (isModuleBundlerFilepath(filepath)) {
            await bundle(null, path.basename(filepath), this.rollupConfig);
          }
        } catch (err) {
          debug(`not found "${req.url}"`);
          res.writeHead('404');
          return res.end();
        }

        hackResponse(req, res, this.hackResponseOptions);

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
