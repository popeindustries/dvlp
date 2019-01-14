'use strict';

const { error, fatal, info, noisyInfo } = require('./utils/log.js');
const { find, getProjectPath, importModule } = require('./utils/file.js');
const {
  interceptFileRead,
  interceptProcessOn
} = require('./utils/intercept.js');
const {
  isModuleBundlerFilepath,
  isNodeModuleFilepath,
  isProjectFilepath
} = require('./utils/is.js');
const { patchResponse } = require('./utils/patch.js');
const { bundle } = require('./utils/bundler.js');
const chalk = require('chalk');
const debug = require('debug')('dvlp:app');
const fs = require('fs');
const http = require('http');
const { maxAge } = require('./config.js');
const Mock = require('./utils/mock.js');
// Work around rollup-plugin-commonjs require.cache
const moduleCache = require('module')._cache;
const path = require('path');
const send = require('send');
const stopwatch = require('./utils/stopwatch.js');
const transpile = require('./utils/transpile.js');
const watch = require('./utils/watch.js');
const { URL } = require('url');

const START_TIMEOUT_DURATION = 2000;

const gc = global.gc || function() {};
const originalCreateServer = http.createServer;
let dvlpModules;

/**
 * Create app server
 * @param {string} mainpath
 * @param {object} [options]
 * @param {string} [options.mockpath]
 * @param {number} [options.port]
 * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }} [options.reloader]
 * @param {object} [options.rollupConfig]
 * @param {(string) => string } [options.transpiler]
 * @returns {{ destroy: () => Promise<void> }}
 */
module.exports = async function appServer(
  mainpath,
  { mockpath, port, reloader, rollupConfig, transpiler } = {}
) {
  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }
  if (dvlpModules === undefined) {
    dvlpModules = Object.keys(moduleCache);
  }

  const main = path.resolve(mainpath);
  const directories = [process.cwd(), path.dirname(main)];
  const instance = new AppServer(
    main,
    directories,
    reloader,
    rollupConfig,
    transpiler,
    mockpath
  );

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
    restart: instance.restart.bind(instance),
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
   * @param {string} [mockpath]
   * @returns {{ destroy: () => Promise<void> }}
   */
  constructor(main, directories, reloader, rollupConfig, transpiler, mockpath) {
    this.appModules = [];
    this.connections = new Map();
    this.exitHandler = null;
    this.filepathToTranspiled = new Map();
    this.findFileOptions = {
      directories
    };
    this.lastChanged = '';
    this.main = main;
    this.mock = mockpath && new Mock(mockpath);
    this.patchResponseOptions = {
      rollupConfig,
      scriptString: reloader && reloader.client,
      scriptUrl: reloader && reloader.url,
      ...this.findFileOptions
    };
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
      noisyInfo(
        `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(
          getProjectPath(filepath)
        )}`
      );

      try {
        await this.restart();
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
        this.mock.match(mocked, res);
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
        const bundled = isModuleBundlerFilepath(filepath);

        if (bundled || isNodeModuleFilepath(filepath)) {
          info(
            `${stopwatch.stop(res.url, true, true)} handled${
              bundled ? ' bundled' : ''
            } request for ${chalk.green(req.url)}`
          );

          return send(req, filepath, {
            cacheControl: true,
            dotfiles: 'allow',
            maxAge
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

          server.on('connection', (connection) => {
            const key = `${connection.remoteAddress}:${connection.remotePort}`;

            instance.connections.set(key, connection);
            connection.on('close', () => {
              instance.connections.delete(key);
            });
          });
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
    // Listen for process event registration to capture any exit handlers
    this.unlistenForProcessOn = interceptProcessOn((event, handler) => {
      if (event === 'exit' || event === 'beforeExit') {
        this.exitHandler = handler;
        return false;
      }
    });
    importModule(this.main);
  }

  /**
   * Stop application
   */
  async stopApplication() {
    this.unlistenForProcessOn();
    if (this.exitHandler) {
      await this.exitHandler();
    }
    process.removeListener('uncaughtException', this.onUncaught);
    process.removeListener('unhandledRejection', this.onUncaught);
    clearAppModules(this.appModules);
    gc();
  }

  /**
   * Stop running server
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise(async (resolve) => {
      for (const connection of this.connections.values()) {
        connection.destroy();
      }
      this.connections.clear();

      await this.stopApplication();

      if (!this.server) {
        return resolve();
      }

      debug('server stopped');
      this.server.removeAllListeners();
      if (!this.server.listening) {
        resolve();
      } else {
        this.server.close(resolve);
      }
    });
  }

  /**
   * Restart running server
   */
  async restart() {
    await this.stop();
    return this.start();
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
    this.mock && this.mock.clean();
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
    delete moduleCache[m];
  }

  debug(`cleared ${appModules.length} app modules from require.cache`);
}

/**
 * Retrieve app modules (excluding node_modules)
 * @returns {[string]}
 */
function getAppModules() {
  const modules = Object.keys(moduleCache).filter(
    (m) => !dvlpModules.includes(m) && !isNodeModuleFilepath(m)
  );

  debug(`found ${modules.length} app modules`);

  return modules;
}
