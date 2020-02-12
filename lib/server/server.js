'use strict';

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
  isNodeModuleFilePath
} = require('../utils/is.js');
const { bundle } = require('../bundler/index.js');
const {
  concatScripts,
  getDvlpGlobalString,
  getProcessEnvString,
  hashScript
} = require('../utils/scripts.js');
const { connectClient, pushEvent } = require('../push-events/index.js');
const chalk = require('chalk');
const config = require('../config.js');
const createFileServer = require('./file-server.js');
const debug = require('debug')('dvlp:server');
const fs = require('fs');
const http = require('http');
const Mock = require('../mock/index.js');
// Work around @rollup/plugin-commonjs require.cache
// @ts-ignore
const moduleCache = require('module')._cache;
const path = require('path');
const { patchResponse } = require('../utils/patch.js');
const send = require('send');
const stopwatch = require('../utils/stopwatch.js');
const transpile = require('../utils/transpile.js');
const watch = require('../utils/watch.js');
const WebSocket = require('faye-websocket');

/** @typedef {import("http").Server} Server */

const START_TIMEOUT_DURATION = 2000;

const { EventSource } = WebSocket;
const originalCreateServer = http.createServer;
/** @type { Array<string> } */
let dvlpModules;
/** @type { Array<string> } */
let globalKeys;

module.exports = class DvlpServer {
  /**
   * Constructor
   *
   * @param { string | (() => void) | undefined } main
   * @param { Reloader } [reloader]
   * @param { object } [rollupConfig]
   * @param { string } [transpilerPath]
   * @param { string | Array<string> } [mockPath]
   */
  constructor(main, reloader, rollupConfig, transpilerPath, mockPath) {
    // Listen for all upcoming file system reads (including require('*'))
    // Register early to catch all reads, including transpilers that patch fs.readFile
    this.watcher = this.createWatcher();
    this.unlistenForFileRead = interceptFileRead((filePath) => {
      this.addWatchFiles(filePath);
    });

    if (dvlpModules === undefined) {
      dvlpModules = Object.keys(moduleCache);
    }
    if (globalKeys === undefined) {
      globalKeys = Object.keys(global);
    }

    /** @type { Array<string> } */
    this.appModules = [];
    this.connections = new Map();
    this.exitHandler = null;
    this.lastChanged = '';
    this.main = main;
    this.mocks = mockPath ? new Mock(mockPath) : undefined;

    const headerScript = concatScripts([
      getProcessEnvString(),
      getDvlpGlobalString(),
      (this.mocks && this.mocks.client) || ''
    ]);

    this.patchResponseOptions = {
      rollupConfig,
      footerScript: {
        hash: reloader && hashScript(reloader.client),
        string: reloader ? reloader.client : '',
        url: reloader && reloader.url
      },
      headerScript: {
        hash: hashScript(headerScript),
        string: headerScript
      }
    };
    this.origin = '';
    this.port = Number(process.env.PORT);
    this.reloader = reloader;
    this.rollupConfig = rollupConfig;
    /** @type { Server | null } */
    this.server = null;
    this.transpiler = transpilerPath && importModule(transpilerPath);
    this.transpilerCache = this.transpiler && new Map();
    this.urlToFilePath = new Map();
  }

  /**
   * Create watcher instance and react to file changes
   *
   * @returns { Watcher }
   */
  createWatcher() {
    return watch(async (filePath) => {
      noisyInfo(
        `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(
          getProjectPath(filePath)
        )}`
      );

      this.lastChanged = filePath;

      try {
        // TODO: conditional upon client-only file?
        await this.restart();

        for (const [url, fp] of this.urlToFilePath) {
          if (fp === filePath) {
            filePath = url;
            break;
          }
        }

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
   * Add "filePaths" to watcher
   *
   * @param { string | Array<string> } filePaths
   */
  addWatchFiles(filePaths) {
    if (!Array.isArray(filePaths)) {
      filePaths = [filePaths];
    }

    for (const filePath of filePaths) {
      if (!isNodeModuleFilePath(filePath)) {
        this.watcher.add(filePath);
      }
    }
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
            args[args.length - 1] = instance.createRequestHandler(
              instance,
              handler
            );
          } else {
            handler = undefined;
          }

          /** @type { Server } */
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
            instance.addWatchFiles(instance.appModules);
            const address = server.address();
            if (address && typeof address !== 'string') {
              instance.port = address.port;
            }
            instance.origin = `http://localhost:${instance.port}`;
            resolve();
          });
          server.on('upgrade', (req, socket, body) => {
            handleMockWebSocket(req, socket, body, instance.mocks);
          });

          // No handler registered so proxy "request" listener
          if (!handler) {
            server.on = new Proxy(server.on, {
              apply(target, ctx, args) {
                const [eventName, listener] = args;

                // Wrap request handler
                if (eventName === 'request') {
                  args[1] = instance.createRequestHandler(instance, listener);
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
   * Create request handler wrapper for 'originalRequestHandler'
   *
   * @param { DvlpServer } server
   * @param { RequestHandler } originalRequestHandler
   * @returns { RequestHandler }
   */
  createRequestHandler(server, originalRequestHandler) {
    return async function requestHandler(req, res) {
      stopwatch.start(req.url);

      const type = getTypeFromRequest(req);
      let filePath = server.urlToFilePath.get(req.url);

      res.url = req.url;

      if (
        handleMockResponse(req, res, server.mocks) ||
        handlePushEvent(req, res, server.mocks)
      ) {
        return;
      }

      // Ignore html or uncached or no longer available at previously known path
      if (type !== 'html' && (!filePath || !fs.existsSync(filePath))) {
        filePath = find(req, { type });

        if (filePath) {
          server.urlToFilePath.set(req.url, filePath);

          if (isModuleBundlerFilePath(filePath)) {
            await bundle(
              path.basename(filePath),
              undefined,
              undefined,
              server.rollupConfig
            );
          }
        } else {
          // File not found. Clear previously known path
          server.urlToFilePath.delete(req.url);
        }
      }

      // Ignore unknow types
      if (type) {
        patchResponse(filePath, req, res, server.patchResponseOptions);
      }

      if (filePath) {
        const bundled = isModuleBundlerFilePath(filePath);

        // node_modules file (bundled or native esm)
        if (bundled || isNodeModuleFilePath(filePath)) {
          info(
            `${stopwatch.stop(res.url, true, true)} handled${
              bundled ? ' bundled' : ''
            } request for ${chalk.green(getProjectPath(req.url))}`
          );

          return send(req, filePath, {
            cacheControl: true,
            dotfiles: 'allow',
            maxAge: config.maxAge
          }).pipe(res);
        } else if (server.transpiler) {
          // Will respond if transpiler for this type
          await transpile(filePath, res, {
            transpilerCache: server.transpilerCache,
            lastChanged: server.lastChanged,
            transpiler: server.transpiler
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
   * Start application
   *
   * @returns { void }
   */
  startApplication() {
    debug('starting application');
    process.on('uncaughtException', this.onUncaught);
    // @ts-ignore
    process.on('unhandledRejection', this.onUncaught);
    // Listen for process event registration to capture any exit handlers
    this.unlistenForProcessOn = interceptProcessOn((event, handler) => {
      if (event === 'exit' || event === 'beforeExit') {
        this.exitHandler = handler;
        return false;
      }
    });
    if (!this.main) {
      createFileServer();
    } else if (typeof this.main === 'function') {
      this.main();
    } else {
      importModule(this.main, this.transpiler);
    }
  }

  /**
   * Stop application
   *
   * @returns { Promise<void> }
   */
  async stopApplication() {
    debug('stopping application');
    if (this.unlistenForProcessOn) {
      this.unlistenForProcessOn();
    }
    if (this.exitHandler) {
      await this.exitHandler();
    }
    process.removeListener('uncaughtException', this.onUncaught);
    process.removeListener('unhandledRejection', this.onUncaught);
    // @ts-ignore
    clearAppModules(this.appModules, this.main);
    clearGlobals();
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
        this.server.close(() => {
          resolve();
        });
      }
    });
  }

  /**
   * Restart running server
   *
   * @returns { Promise<void> }
   */
  async restart() {
    if (this.main) {
      debug('server restarting');
      await this.stop();
      return this.start();
    }
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
    debug('server destroying');
    this.mocks && this.mocks.clean();
    this.unlistenForFileRead();
    this.watcher.close();
    return this.stop();
  }
};

/**
 * Handle mock responses, including EventSource connection
 * Returns 'true' if handled
 *
 * @param { Req } req
 * @param { Res } res
 * @param { Mock } [mocks]
 * @returns { boolean }
 */
function handleMockResponse(req, res, mocks) {
  const url = new URL(req.url, `http://localhost:${config.activePort}`);
  let mock = url.searchParams.get('dvlpmock');

  if (mocks && mock) {
    mock = decodeURIComponent(mock);

    // @ts-ignore
    if (EventSource.isEventSource(req)) {
      connectClient(
        {
          url: mock,
          type: 'es'
        },
        req,
        res
      );
      // Send 'connect' event if it exists
      mocks.matchPushEvent(mock, 'connect', pushEvent);
      noisyInfo(
        `${stopwatch.stop(
          req.url,
          true,
          true
        )} connected to EventSource client at ${chalk.green(mock)}`
      );
    } else {
      mocks.matchResponse(mock, req, res);
    }

    return true;
  }

  return false;
}

/**
 * Handle mock WebSocket connection
 *
 * @param { Req } req
 * @param { object } socket
 * @param { object } body
 * @param { Mock } [mocks]
 * @returns { void }
 */
function handleMockWebSocket(req, socket, body, mocks) {
  const url = new URL(req.url, `http://localhost:${config.activePort}`);
  let mock = url.searchParams.get('dvlpmock');

  if (mocks && mock && WebSocket.isWebSocket(req)) {
    mock = decodeURIComponent(mock);
    connectClient(
      {
        url: mock,
        type: 'ws'
      },
      req,
      socket,
      body
    );
    // Send 'connect' event if it exists
    mocks.matchPushEvent(mock, 'connect', pushEvent);
    noisyInfo(
      `${stopwatch.stop(
        req.url,
        true,
        true
      )} connected to WebSocket client at ${chalk.green(mock)}`
    );
  }
}

/**
 * Handle push event request
 * Returns 'true' if handled
 *
 * @param { Req } req
 * @param { Res } res
 * @param { Mock } [mocks]
 * @returns { boolean }
 */
function handlePushEvent(req, res, mocks) {
  if (mocks && req.method === 'POST' && req.url === '/dvlp/push-event') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const { stream, event } = JSON.parse(body);

      if (typeof event === 'string') {
        mocks.matchPushEvent(stream, event, pushEvent);
      } else {
        pushEvent(stream, event);
      }

      res.writeHead(200);
      res.end('ok');
    });

    return true;
  }

  return false;
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

/**
 * Clear app modules from module cache
 *
 * @param { Array<string> } appModules
 * @param { string } main
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
 * Clear any added globals
 */
function clearGlobals() {
  for (const key of Object.keys(global)) {
    if (!globalKeys.includes(key)) {
      // @ts-ignore
      global[key] = undefined;
    }
  }
}
