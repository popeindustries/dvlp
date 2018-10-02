'use strict';

const { error, fatal, info } = require('./utils/log');
const { find, getProjectPath } = require('./utils/file');
const { interceptFileRead } = require('./utils/intercept');
const { isModuleBundlerFilepath, isNodeModuleFilepath, isProjectFilepath } = require('./utils/is');
const { patchResponse } = require('./utils/patch');
const { bundle } = require('./utils/bundler');
const chalk = require('chalk');
const debug = require('debug')('dvlp:app');
const decorateWithServerDestroy = require('server-destroy');
const fs = require('fs');
const http = require('http');
const mock = require('./utils/mock');
const path = require('path');
const send = require('send');
const stopwatch = require('./utils/stopwatch');
const transpile = require('./utils/transpile');
const watch = require('./utils/watch');
const { URL } = require('url');

const START_TIMEOUT_DURATION = 2000;

const originalCreateServer = http.createServer;
let dvlpModules;

/**
 * Create app server
 * @param {string} mainpath
 * @param {{ port: number, reloader: { client: string, send: (string, object) => void, destroy: () => Promise<void> }, rollupConfig: object, transpiler: (string) => string }} [options]
 * @returns {{ destroy: () => Promise<void> }}
 */
module.exports = async function appServer(
  mainpath,
  { port, reloader, rollupConfig, transpiler } = {}
) {
  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }
  if (dvlpModules === undefined) {
    dvlpModules = Object.keys(require.cache);
  }

  const main = path.resolve(mainpath);
  const directories = [process.cwd(), path.dirname(main)];
  const instance = new AppServer(main, directories, reloader, rollupConfig, transpiler);

  try {
    await instance.start();
    port = instance.port;
  } catch (err) {
    return error(err);
  }

  info(
    `\n  💥 serving ${chalk.green(mainpath)} at ${chalk.green.underline(
      `http://localhost:${port}`
    )}`
  );

  return {
    port,
    destroy: instance.destroy.bind(instance)
  };
};

class AppServer {
  /**
   * Constructor
   * @param {string} main
   * @param {[string]} directories
   * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }} [reloader]
   * @param {object} [rollupConfig]
   * @param {(string) => string} [transpiler]
   * @returns {{ destroy: () => Promise<void> }}
   */
  constructor(main, directories, reloader, rollupConfig, transpiler) {
    this.appModules = [];
    this.filepathToTranspiled = new Map();
    this.findFileOptions = {
      directories,
      scriptString: reloader && reloader.client
    };
    this.lastChanged = '';
    this.main = main;
    this.patchResponseOptions = { rollupConfig, ...this.findFileOptions };
    this.port = process.env.PORT;
    this.reloader = reloader;
    this.rollupConfig = rollupConfig;
    this.server = null;
    this.transpiler = transpiler;
    this.urlToFilepath = new Map();
    this.watcher = this.createWatcher();

    // Listen for all upcoming file system reads (including require('*'))
    this.unlistenForFileRead = interceptFileRead((filepath) => {
      if (isProjectFilepath(filepath)) {
        this.watcher.add(filepath);
      }
    });
  }

  /**
   * Create watcher instance and listen for file changes
   * @returns {object}
   */
  createWatcher() {
    return watch(async (filepath) => {
      debug('restarting server');

      this.lastChanged = filepath;
      info(`\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(getProjectPath(filepath))}`);

      try {
        await this.stop();
        await this.start();
        this.reloader && this.reloader.send(filepath);
      } catch (err) {
        error(err);
      }
    });
  }

  /**
   * Create request handler wrapper for 'originalRequestHandler'
   * @param {(http.ClientRequest, http.ServerResponse) => void} originalRequestHandler
   * @returns {(http.ClientRequest, http.ServerResponse) => void}
   */
  createRequestHandler(originalRequestHandler) {
    return async function requestHandler(req, res) {
      stopwatch.start(req.url);

      const url = new URL(req.url, `http://localhost:${this.port}`);
      const mocked = url.searchParams.get('mock');
      let filepath = this.urlToFilepath.get(req.url);

      res.url = req.url;

      if (mocked) {
        mock.match(mocked, res);
        return;
      }

      // Uncached or no longer available at previously known path
      if (!filepath || !fs.existsSync(filepath)) {
        try {
          filepath = find(req, this.findFileOptions);
          this.urlToFilepath.set(req.url, filepath);
          if (isModuleBundlerFilepath(filepath)) {
            await bundle(path.basename(filepath), undefined, this.rollupConfig);
          }
        } catch (err) {
          // File not found. Clear previously known path
          this.urlToFilepath.delete(req.url);
        }
      }

      patchResponse(req, res, this.patchResponseOptions);

      if (filepath) {
        if (isModuleBundlerFilepath(filepath)) {
          info(
            `${stopwatch.stop(res.url, true, true)} handled bundled request for ${chalk.green(
              req.url
            )}`
          );
          return send(req, filepath, {
            cacheControl: false,
            dotfiles: 'allow'
          }).pipe(res);
        } else if (this.transpiler) {
          // Will respond if transpiler for this type
          await transpile(filepath, res, {
            filepathToTranspiled: this.filepathToTranspiled,
            lastChanged: this.lastChanged,
            transpiler: this.transpiler
          });
        }
      }

      // Not mocked/transpiled/bundled, so pass through request to app
      if (!res.finished) {
        debug(`allowing app to handle "${req.url}"`);
        originalRequestHandler(req, res);
      }
    };
  }

  /**
   * Start app server
   * Proxies createServer to grab instance and register for events
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      // Force reject if never started
      const timeoutID = setTimeout(() => {
        debug('server not started after timeout');
        reject(Error('unable to start server'));
      }, START_TIMEOUT_DURATION);
      const instance = this;

      http.createServer = new Proxy(http.createServer, {
        apply(target, ctx, args) {
          // Wrap request handler
          // Always last arg ('options' as first arg added in 9.6)
          args[args.length - 1] = instance
            .createRequestHandler(args[args.length - 1])
            .bind(instance);

          const server = (instance.server = Reflect.apply(target, ctx, args));

          server.timeout = server.keepAliveTimeout = 0;
          decorateWithServerDestroy(server);

          server.on('error', (err) => {
            instance.stop();
            reject(err);
          });
          server.on('listening', () => {
            debug('server started');
            clearTimeout(timeoutID);
            instance.appModules = getAppModules();
            instance.watcher.add(instance.appModules);
            instance.port = server.address().port;
            resolve();
          });

          // Un-proxy in case more than one server created
          // (assumes first server is application server)
          http.createServer = originalCreateServer;

          return server;
        }
      });

      try {
        // Trigger application bootstrap
        this.startApplication();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Start application
   */
  startApplication() {
    process.on('uncaughtException', this.onUncaught);
    process.on('unhandledRejection', this.onUncaught);
    require(this.main);
  }

  /**
   * Stop application
   */
  stopApplication() {
    process.removeListener('uncaughtException', this.onUncaught);
    process.removeListener('unhandledRejection', this.onUncaught);
    clearAppModules(this.appModules);
  }

  /**
   * Stop running server
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      this.stopApplication();

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
   * Handler 'err'
   * @param {Error} err
   */
  onUncaught(err) {
    fatal(err);
  }

  /**
   * Destroy instance
   */
  destroy() {
    debug('destroying');
    this.unlistenForFileRead();
    this.watcher.close();
    return this.stop();
  }
}

/**
 * Clear app modules from module cache
 * @param {[string]} appModules
 */
function clearAppModules(appModules) {
  for (const m of appModules) {
    delete require.cache[m];
  }

  debug(`cleared ${appModules.length} app modules from require.cache`);
}

/**
 * Retrieve app modules (excluding node_modules)
 * @returns {[string]}
 */
function getAppModules() {
  const modules = Object.keys(require.cache).filter(
    (m) => !dvlpModules.includes(m) && !isNodeModuleFilepath(m)
  );

  debug(`found ${modules.length} app modules`);

  return modules;
}
