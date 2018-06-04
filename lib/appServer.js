'use strict';

const { find, getProjectPath, listenForFileRead, urlMatchesFilepath } = require('./utils/file');
const { error, info } = require('./utils/log');
const { patchRequest, patchResponse } = require('./utils/patch');
const chalk = require('chalk');
const debug = require('debug')('dvlp:app');
const http = require('http');
const path = require('path');
const send = require('send');
const decorateWithServerDestroy = require('server-destroy');
const transpile = require('./utils/transpile');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;
const RE_NODE_MODULES = /node_modules/;
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
  { port = DEFAULT_PORT, reloader, rollupConfig, transpiler } = {}
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

  await instance.start();

  info(
    `💥 serving ${chalk.green(mainpath)} at ${chalk.green.underline(
      `http://localhost:${instance.server.address().port}`
    )}`
  );

  return {
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
    this.directories = directories;
    this.errored = false;
    this.filepathToTranspiled = new Map();
    this.lastChanged = '';
    this.main = main;
    this.pendingRequests = new Set();
    this.reloader = reloader;
    this.rollupConfig = rollupConfig;
    this.server = null;
    this.transpiler = transpiler;
    this.unlistenForFileRead = null;
    this.urlToFilepath = new Map();
    this.watcher = this.createWatcher();

    this.createFileReadListener();
  }

  /**
   * Create watcher instance and listen for file changes
   * @returns {object}
   */
  createWatcher() {
    return watch(async (filepath) => {
      debug('restarting server');

      try {
        await this.stop();
        await this.start();
        info(`⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(getProjectPath(filepath))}`);
      } catch (err) {
        error(err);
      }

      this.lastChanged = filepath;
      !this.errored && this.reloader && this.reloader.send(filepath);
    });
  }

  /**
   * Listen for all upcoming file system reads (including require('*'))
   */
  createFileReadListener() {
    this.unlistenForFileRead = listenForFileRead(process.cwd(), (filepath) => {
      // Match filepath with pending request
      for (const url of this.pendingRequests) {
        if (!this.urlToFilepath.has(url) && urlMatchesFilepath(url, filepath)) {
          matchUrlToFilepath(url, filepath, this.pendingRequests, this.urlToFilepath);
          break;
        }
      }
      this.watcher.add(filepath);
    });
  }

  /**
   * Start app server.
   * Proxies createServer to grab instance and register for events,
   * then requires main to trigger application bootstrap
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
          // Always last arg ('options' as first arg added in 9.6)
          const requestListener = args[args.length - 1];

          // Wrap request listener
          args[args.length - 1] = async (req, res) => {
            let filepath = instance.urlToFilepath.get(req.url);

            instance.pendingRequests.add(req.url);

            if (!filepath) {
              try {
                // Triggers bundling of bare js imports
                filepath = await find(req, instance.directories, instance.rollupConfig);
                matchUrlToFilepath(
                  req.url,
                  filepath,
                  instance.pendingRequests,
                  instance.urlToFilepath
                );
              } catch (err) {
                // ignore
              }
            }

            patchRequest(req);
            patchResponse(req, res, instance.reloader && instance.reloader.client);

            // Send js file if we found it, otherwise let application handle it
            if (filepath) {
              instance.watcher.add(filepath);
              if (instance.transpiler) {
                await transpile(filepath, res, {
                  filepathToTranspiled: instance.filepathToTranspiled,
                  lastChanged: instance.lastChanged,
                  transpiler: instance.transpiler
                });
              }

              // Not transpiled
              if (!res.finished) {
                debug(`sending file "${getProjectPath(filepath)}"`);
                return send(req, filepath, {
                  cacheControl: false,
                  dotfiles: 'allow'
                }).pipe(res);
              }
            }

            requestListener(req, res);
          };

          instance.server = Reflect.apply(target, ctx, args);
          instance.server.timeout = instance.server.keepAliveTimeout = 0;
          decorateWithServerDestroy(instance.server);

          instance.server.on('error', (err) => {
            instance.stop();
            reject(err);
          });
          instance.server.on('listening', () => {
            debug('server started');
            clearTimeout(timeoutID);
            instance.appModules = getAppModules();
            resolve();
          });

          // Un-proxy in case more than one server created
          // (assumes first server is application server)
          http.createServer = originalCreateServer;

          return instance.server;
        }
      });

      try {
        // Trigger application bootstrap
        this.startApplication();
      } catch (err) {
        error(err);
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
    this.errored = false;
    require(this.main);
  }

  /**
   * Stop application
   */
  stopApplication() {
    process.off('uncaughtException', this.onUncaught);
    process.off('unhandledRejection', this.onUncaught);
    clearAppModules(this.appModules);
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

      this.stopApplication();
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
    error(err);
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
    require.cache[m] = undefined;
  }

  debug(`cleared ${appModules.length} app modules from require.cache`);
}

/**
 * Retrieve app modules (excluding node_modules)
 * @returns {[string]}
 */
function getAppModules() {
  const modules = Object.keys(require.cache).filter(
    (m) => !dvlpModules.includes(m) && !RE_NODE_MODULES.test(m)
  );

  debug(`found ${modules.length} app modules`);

  return modules;
}

/**
 * Store 'url' to 'filepath' relationship
 * @param {string} url
 * @param {string} filepath
 * @param {Set} pendingRequests
 * @param {Map} urlToFilepath
 */
function matchUrlToFilepath(url, filepath, pendingRequests, urlToFilepath) {
  pendingRequests.delete(url);
  urlToFilepath.set(url, filepath);
  debug(`matched "${url}" to "${filepath}"`);
}
