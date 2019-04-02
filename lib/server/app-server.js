'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 * @typedef { import("../reloader/index.js").reloadServer } reloadServer
 * @typedef { import("http").ServerResponse } ServerResponse
 * @typedef { import("../utils/watch.js").watcher } watcher
 */
/**
 * @typedef { object } appServer
 * @property { () => Promise<void> } destroy
 * @property { number } port
 * @property { () => Promise<void> } restart
 */

const { error, fatal, info, noisyInfo } = require('../utils/log.js');
const {
  find,
  getProjectPath,
  getTypeFromRequest,
  importModule
} = require('../utils/file.js');
const {
  interceptFileRead,
  interceptProcessOn
} = require('../utils/intercept.js');
const {
  isModuleBundlerFilePath,
  isNodeModuleFilePath,
  isProjectFilePath
} = require('../utils/is.js');
const { bundle } = require('../bundler/index.js');
const chalk = require('chalk');
const config = require('../config.js');
const debug = require('debug')('dvlp:app');
const fs = require('fs');
const http = require('http');
const Mock = require('../mock/index.js');
// Work around rollup-plugin-commonjs require.cache
const moduleCache = require('module')._cache;
const path = require('path');
const { patchResponse } = require('../utils/patch.js');
const send = require('send');
const stopwatch = require('../utils/stopwatch.js');
const transpile = require('../utils/transpile.js');
const watch = require('../utils/watch.js');
const { URL } = require('url');

const START_TIMEOUT_DURATION = 2000;

const originalCreateServer = http.createServer;
let dvlpModules;

/**
 * Create app server
 *
 * @param { string } mainpath
 * @param { object } [options]
 * @param { string } [options.mockPath]
 * @param { number } [options.port]
 * @param { reloadServer } [options.reloader]
 * @param { object } [options.rollupConfig]
 * @param { (string) => string } [options.transpiler]
 * @returns { appServer }
 */
module.exports = async function appServer(
  mainpath,
  { mockPath, port, reloader, rollupConfig, transpiler } = {}
) {
  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }
  if (dvlpModules === undefined) {
    dvlpModules = Object.keys(moduleCache);
  }

  const main = path.resolve(mainpath);
  const directories = [process.cwd(), path.dirname(main)];
  const server = new AppServer(
    main,
    directories,
    reloader,
    rollupConfig,
    transpiler,
    mockPath
  );

  try {
    await server.start();
    port = server.port;
  } catch (err) {
    return error(err);
  }

  info(
    `\n  💥 serving ${chalk.green(mainpath)} at ${chalk.green.underline(
      `http://localhost:${port}`
    )}`
  );

  return {
    destroy: server.destroy.bind(server),
    port,
    restart: server.restart.bind(server)
  };
};

class AppServer {
  /**
   * Constructor
   *
   * @param { string } main
   * @param { Array<string> } directories
   * @param { reloader } [reloader]
   * @param { object } [rollupConfig]
   * @param { (string) => string } [transpiler]
   * @param { string } [mockPath]
   */
  constructor(main, directories, reloader, rollupConfig, transpiler, mockPath) {
    this.appModules = [];
    this.connections = new Map();
    this.exitHandler = null;
    this.findFileOptions = {
      directories
    };
    this.lastChanged = '';
    this.main = main;
    this.mock = mockPath && new Mock(mockPath);
    this.patchResponseOptions = {
      rollupConfig,
      footerScript: {
        hash: reloader && reloader.clientHash,
        string: reloader && reloader.client,
        url: reloader && reloader.url
      },
      headerScript: {
        hash: mockPath && this.mock.clientHash,
        string: mockPath && this.mock.client
      },
      ...this.findFileOptions
    };
    this.port = process.env.PORT;
    this.reloader = reloader;
    this.rollupConfig = rollupConfig;
    this.server = null;
    this.transpiler = transpiler;
    this.transpilerCache = transpiler && new Map();
    this.urlToFilePath = new Map();
    this.watcher = this.createWatcher();

    // Listen for all upcoming file system reads (including require('*'))
    this.unlistenForFileRead = interceptFileRead((filePath) => {
      if (isProjectFilePath(filePath)) {
        this.watcher.add(filePath);
      }
    });
  }

  /**
   * Create watcher instance and listen for file changes
   *
   * @returns { watcher }
   */
  createWatcher() {
    return watch(async (filePath) => {
      debug('restarting server');

      this.lastChanged = filePath;
      noisyInfo(
        `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(
          getProjectPath(filePath)
        )}`
      );

      try {
        await this.restart();
        // Will trigger one of:
        // 1. single css refresh if css and a link.href matches filePath
        // 2. multiple css refreshes if css and no link.href matches filePath (ie. it's a dependency)
        // 3. full page reload
        this.reloader && this.reloader.send(filePath);
      } catch (err) {
        error(err);
      }
    });
  }

  /**
   * Create request handler wrapper for 'originalRequestHandler'
   *
   * @param { (ClientRequest, ServerResponse) => void } originalRequestHandler
   * @returns { (ClientRequest, ServerResponse) => void }
   */
  createRequestHandler(originalRequestHandler) {
    return async function requestHandler(req, res) {
      stopwatch.start(req.url);

      const url = new URL(req.url, `http://localhost:${this.port}`);
      const mocked = url.searchParams.get('dvlpmock');
      const type = getTypeFromRequest(req);
      let filePath = this.urlToFilePath.get(req.url);

      res.url = req.url;

      if (mocked) {
        this.mock.match(mocked, res);
        return;
      }

      // Ignore html or uncached or no longer available at previously known path
      if (type !== 'html' && (!filePath || !fs.existsSync(filePath))) {
        try {
          filePath = find(req, this.findFileOptions, type);
          this.urlToFilePath.set(req.url, filePath);

          if (isModuleBundlerFilePath(filePath)) {
            await bundle(path.basename(filePath), undefined, this.rollupConfig);
          }
        } catch (err) {
          // File not found. Clear previously known path
          this.urlToFilePath.delete(req.url);
        }
      }

      patchResponse(filePath, req, res, this.patchResponseOptions);

      if (filePath) {
        const bundled = isModuleBundlerFilePath(filePath);

        // Bundled or node_module esm file
        if (bundled || isNodeModuleFilePath(filePath)) {
          info(
            `${stopwatch.stop(res.url, true, true)} handled${
              bundled ? ' bundled' : ''
            } request for ${chalk.green(req.url)}`
          );

          return send(req, filePath, {
            cacheControl: true,
            dotfiles: 'allow',
            maxAge: config.maxAge
          }).pipe(res);
        } else if (this.transpiler) {
          // Will respond if transpiler for this type
          await transpile(filePath, res, {
            transpilerCache: this.transpilerCache,
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
   *
   * @returns { Promise<void> }
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
          // Handler always last arg ('options' as first arg added in 9.6)
          let handler = args[args.length - 1];

          // Wrap request handler (if passed)
          if (handler && typeof handler === 'function') {
            args[args.length - 1] = instance
              .createRequestHandler(handler)
              .bind(instance);
          } else {
            handler = undefined;
          }

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

          // No handler registered so proxy "request" listener
          if (!handler) {
            server.on = new Proxy(server.on, {
              apply(target, ctx, args) {
                const [eventName, listener] = args;

                // Wrap request handler
                if (eventName === 'request') {
                  args[1] = instance
                    .createRequestHandler(listener)
                    .bind(instance);
                }

                Reflect.apply(target, ctx, args);
              }
            });
          }

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
   *
   * @returns { void }
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
   *
   * @returns { void }
   */
  async stopApplication() {
    this.unlistenForProcessOn();
    if (this.exitHandler) {
      await this.exitHandler();
    }
    process.removeListener('uncaughtException', this.onUncaught);
    process.removeListener('unhandledRejection', this.onUncaught);
    clearAppModules(this.appModules, this.main);
  }

  /**
   * Stop running server
   *
   * @returns { Promise<void> }
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
   *
   * @returns { Promise<void> }
   */
  async restart() {
    await this.stop();
    return this.start();
  }

  /**
   * Handle uncaughtException & unhandledRejection
   * Logs errors to console
   *
   * @param { Error } err
   * @returns { void }
   */
  onUncaught(err) {
    fatal(err);
  }

  /**
   * Destroy instance
   *
   * @returns { Promise<void> }
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
 *
 * @param { Array<string> } appModules
 */
function clearAppModules(appModules, main) {
  const mainModule = moduleCache[main];

  // Remove main from parent
  // (No children when bundled)
  if (
    mainModule !== undefined &&
    mainModule.parent !== undefined &&
    mainModule.parent.children !== undefined
  ) {
    const parent = mainModule.parent;
    let i = parent.children.length;

    while (--i) {
      if (parent.children[i].id === mainModule.id) {
        parent.children.splice(i, 1);
      }
    }
  }

  for (const m of appModules) {
    delete moduleCache[m];
  }

  debug(`cleared ${appModules.length} app modules from require.cache`);
}

/**
 * Retrieve app modules (excluding node_modules)
 *
 * @returns { Array<string> }
 */
function getAppModules() {
  const modules = Object.keys(moduleCache).filter(
    (m) => !dvlpModules.includes(m) /* && !isNodeModuleFilePath(m) */
  );

  debug(`found ${modules.length} app modules`);

  return modules;
}
