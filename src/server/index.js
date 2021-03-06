import { concatScripts, getDvlpGlobalString, getProcessEnvString, hashScript } from '../utils/scripts.js';
import { connectClient, pushEvent } from '../push-events/index.js';
import { createRequireHook, favIcon, find, getProjectPath, getTypeFromRequest } from '../utils/file.js';
import { error, fatal, info, noisyInfo } from '../utils/log.js';
import { interceptFileRead, interceptProcessOn } from '../utils/intercept.js';
import { isBundledFilePath, isNodeModuleFilePath } from '../utils/is.js';
import chalk from 'chalk';
import config from '../config.js';
import createFileServer from './file-server.js';
import { createRequire } from 'module';
import Debug from 'debug';
import { EventSource } from '../reloader/event-source.js';
import fs from 'fs';
import Hooker from '../hooks/index.js';
import http from 'http';
import Metrics from '../utils/metrics.js';
import Mock from '../mock/index.js';
import { parseUserAgent } from '../utils/platform.js';
import { patchResponse } from '../utils/patch.js';
import send from 'send';
import { URL } from 'url';
import watch from '../utils/watch.js';
import WebSocket from 'faye-websocket';

const START_TIMEOUT_DURATION = 4000;

const debug = Debug('dvlp:server');
const originalCreateServer = http.createServer;
const require = createRequire(import.meta.url);
const moduleCache = require.cache;
/** @type { Array<string> } */
let dvlpModules;
/** @type { Array<string> } */
let globalKeys;

export default class DvlpServer {
  /**
   * Constructor
   *
   * @param { string | (() => void) | undefined } main
   * @param { Reloader } [reloader]
   * @param { Hooks } [hooks]
   * @param { string | Array<string> } [mockPath]
   */
  constructor(main, reloader, hooks, mockPath) {
    // Listen for all upcoming file system reads
    // Register early to catch all reads, including transformers that patch fs.readFile
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
    this.staticMode = main === undefined;

    const headerScript = concatScripts([
      getProcessEnvString(),
      getDvlpGlobalString(),
      (this.mocks && this.mocks.client) || '',
    ]);

    this.origin = '';
    this.port = Number(process.env.PORT);
    this.reloader = reloader;
    /** @type { HttpServer | null } */
    this.server = null;
    this.hooks = new Hooker(hooks, this.watcher);
    this.revertRequireHook = createRequireHook(this.hooks.serverTransform);
    this.urlToFilePath = new Map();
    /** @type { PatchResponseOptions } */
    this.patchResponseOptions = {
      footerScript: {
        hash: reloader && hashScript(reloader.reloadEmbed),
        string: reloader ? reloader.reloadEmbed : '',
        url: reloader && reloader.reloadUrl,
      },
      headerScript: {
        hash: hashScript(headerScript),
        string: headerScript,
      },
      resolveImport: this.hooks.resolveImport,
      send: this.hooks.send,
    };
  }

  /**
   * Create watcher instance and react to file changes
   *
   * @returns { Watcher }
   */
  createWatcher() {
    return watch(async (filePath) => {
      noisyInfo(`\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(getProjectPath(filePath))}`);

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
            args[args.length - 1] = instance.createRequestHandler(instance, handler);
          } else {
            handler = undefined;
          }

          /** @type { HttpServer } */
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
              },
            });
          }

          // Un-proxy in case more than one server created
          // (assumes first server is application server)
          http.createServer = originalCreateServer;

          return server;
        },
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
      res.metrics = new Metrics(res);

      res.once('finish', () => {
        if (!res.unhandled) {
          const duration = res.metrics.getEvent('response', true);
          const modifier = res.bundled
            ? ' bundled '
            : res.mocked
            ? ' mocked '
            : res.transformed
            ? ' transformed '
            : ' ';
          let url = getProjectPath(req.url);

          if (res.mocked) {
            // Decode query param and strip "?dvlpmock=" prefix (sometimes double encoded if coming from client)
            url = decodeURIComponent(decodeURIComponent(url.slice(url.indexOf('?dvlpmock=') + 10)));
          }

          const msg = `${duration} handled${chalk.italic(modifier)}request for ${chalk.green(url)}`;

          res.mocked ? noisyInfo(msg) : info(msg);
        }
      });

      const type = getTypeFromRequest(req);
      let filePath = server.urlToFilePath.get(req.url);

      res.url = req.url;

      if (
        handleFavicon(req, res) ||
        handleMockResponse(req, res, server.mocks) ||
        handlePushEvent(req, res, server.mocks)
      ) {
        return;
      }

      // Allow manual response handling via user hook
      if (await server.hooks.handleRequest(req, res)) {
        return;
      }

      // Ignore html or uncached or no longer available at previously known path
      if (type !== 'html' && (!filePath || !fs.existsSync(filePath))) {
        filePath = find(req, { type });

        if (filePath) {
          server.addWatchFiles(filePath);
          server.urlToFilePath.set(req.url, filePath);
        } else {
          // File not found. Clear previously known path
          server.urlToFilePath.delete(req.url);
        }
      }

      // Ignore unknown types
      if (type) {
        patchResponse(filePath, req, res, server.patchResponseOptions);
      }

      if (filePath) {
        if (isBundledFilePath(filePath)) {
          // Will write new file to disk
          await server.hooks.bundleDependency(filePath, res);
        }
        // Transform all files that aren't bundled or node_modules
        // This ensures that all symlinked workspace files are transformed even though they are dependencies
        if (!isNodeModuleFilePath(filePath)) {
          // Will respond if transformer exists for this type
          await server.hooks.transform(filePath, server.lastChanged, res, parseUserAgent(req.headers['user-agent']));
        }

        // Handle bundled, node_modules, and external files if not already handled by transformer
        if (!res.finished) {
          return send(req, filePath, {
            cacheControl: true,
            dotfiles: 'allow',
            maxAge: config.maxAge,
            etag: false,
            lastModified: false,
          }).pipe(res);
        }
      }

      // Pass through request to app
      if (!res.finished) {
        res.unhandled = true;
        if (!server.staticMode) {
          noisyInfo(`  allowing app to handle "${req.url}"`);
        }
        originalRequestHandler(req, res);
      }
    };
  }

  /**
   * Start application
   *
   * @returns { Promise<void> }
   */
  async startApplication() {
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
      require(this.main);
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
    this.mocks && this.mocks.clear();
    this.unlistenForFileRead();
    this.watcher.close();
    this.hooks.destroy();
    this.revertRequireHook();
    return this.stop();
  }
}

/**
 * Handle request for favicon
 * Returns 'true' if handled
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { boolean }
 */
function handleFavicon(req, res) {
  if (req.url.includes('/favicon.ico')) {
    res.writeHead(200, {
      'Content-Length': favIcon.length,
      'Cache-Control': `public, max-age=${config.maxAge}`,
      'Content-Type': 'image/x-icon;charset=UTF-8',
    });
    res.end(favIcon);
    return true;
  }
  return false;
}

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
  const url = new URL(req.url, `http://localhost:${config.applicationPort}`);
  let mock = url.searchParams.get('dvlpmock');

  if (mocks && mock) {
    mock = decodeURIComponent(mock);

    if (EventSource.isEventSource(req)) {
      connectClient(
        {
          url: mock,
          type: 'es',
        },
        req,
        res,
      );
      // Send 'connect' event if it exists
      mocks.matchPushEvent(mock, 'connect', pushEvent);
      noisyInfo(`${chalk.green('     0ms')} connected to EventSource client at ${chalk.green(mock)}`);
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
  const url = new URL(req.url, `http://localhost:${config.applicationPort}`);
  let mock = url.searchParams.get('dvlpmock');

  if (mocks && mock && WebSocket.isWebSocket(req)) {
    mock = decodeURIComponent(mock);
    connectClient(
      {
        url: mock,
        type: 'ws',
      },
      req,
      socket,
      body,
    );
    // Send 'connect' event if it exists
    mocks.matchPushEvent(mock, 'connect', pushEvent);
    noisyInfo(`${chalk.green('     0ms')} connected to WebSocket client at ${chalk.green(mock)}`);
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
  const modules = Object.keys(moduleCache).filter((m) => !dvlpModules.includes(m));

  debug(`found ${modules.length} app modules`);

  return modules;
}

/**
 * Clear app modules from module cache
 *
 * @param { Array<string> } appModules
 * @param { string | (() => void) | undefined } main
 */
function clearAppModules(appModules, main) {
  // @ts-ignore
  const mainModule = moduleCache[main];

  // Remove main from parent
  // (No children when bundled)
  if (mainModule != undefined && mainModule.parent != null && mainModule.parent.children != null) {
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
