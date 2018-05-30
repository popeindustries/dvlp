'use strict';

const { find, listenForFileRead, urlMatchesFilepath } = require('./utils/file');
const { info } = require('./utils/log');
const { isJsRequest } = require('./utils/is');
const { patchRequest, patchResponse } = require('./utils/patch');
const chalk = require('chalk');
const debug = require('debug')('dvlp:app');
const http = require('http');
const path = require('path');
const send = require('send');
const serverDestroy = require('server-destroy');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;
const RE_NODE_MODULES = /node_modules/;
const START_TIMEOUT_DURATION = 2000;

const originalCreateServer = http.createServer;
let dvlpModules;

/**
 * Create app server
 * @param {string} mainpath
 * @param {{ port: number, reload: { client: string, send: (string, object) => void, destroy: () => Promise<void> }, rollupOptions: object }} [options]
 * @returns {{ destroy: () => Promise<void> }}
 */
module.exports = async function appServer(
  mainpath,
  { port = DEFAULT_PORT, reload, rollupOptions } = {}
) {
  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }
  if (dvlpModules === undefined) {
    dvlpModules = Object.keys(require.cache);
  }

  const instance = await factory(path.resolve(mainpath), reload, rollupOptions);

  info(`Serving ${chalk.green(mainpath)} at ${chalk.green.underline(`http://localhost:${port}`)}`);

  return instance;
};

/**
 * Factory for return instance
 * @param {string} main
 * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }} [reload]
 * @param {object} [rollupOptions]
 * @returns {{ destroy: () => Promise<void> }}
 */
async function factory(main, reload, rollupOptions) {
  const state = {
    appModules: [],
    urlToFilepath: new Map(),
    main,
    pendingRequests: new Set(),
    reload,
    rollupOptions,
    server: null,
    unlistenForFileRead: null
  };

  createWatcher(state);
  createFileReadListener(state);
  await start(state);

  return {
    destroy() {
      debug('destroying');
      clearAppModules(state.appModules);
      state.unlistenForFileRead();
      state.watcher.close();
      return stop(state);
    }
  };
}

/**
 * Create watcher instance and listen for file changes
 * @param {object} state
 */
function createWatcher(state) {
  state.watcher = watch(async (filepath) => {
    const { appModules, reload } = state;

    debug('restarting server');

    clearAppModules(appModules);

    try {
      await stop(state);
      await start(state);
      info(
        `[${new Date().toLocaleTimeString()}] ${chalk.yellow('changed')} ${path.basename(filepath)}`
      );
    } catch (err) {
      console.error(err);
    }

    reload && reload.send(filepath);
  });
}

/**
 * Listen for all upcoming file system reads (including require('*'))
 * @param {object} state
 */
function createFileReadListener(state) {
  const { pendingRequests, urlToFilepath, watcher } = state;

  state.unlistenForFileRead = listenForFileRead(process.cwd(), (filepath) => {
    // Match filepath with pending request
    for (const url of pendingRequests) {
      if (!urlToFilepath.has(url) && urlMatchesFilepath(url, filepath)) {
        matchUrlToFilepath(url, filepath, pendingRequests, urlToFilepath);
        break;
      }
    }
    watcher.add(filepath);
  });
}

/**
 * Start app server.
 * Proxies createServer to grab instance and register for events,
 * then requires main to trigger application bootstrap
 * @param {object} state
 * @returns {Promise<void>}
 */
function start(state) {
  const { main, pendingRequests, reload, rollupOptions, urlToFilepath } = state;

  return new Promise((resolve, reject) => {
    // Force reject if never started
    const timeoutID = setTimeout(() => {
      debug('server not started after timeout');
      reject(Error('unable to start server'));
    }, START_TIMEOUT_DURATION);
    let server;

    http.createServer = new Proxy(http.createServer, {
      apply(target, ctx, args) {
        // Always last arg ('options' as first arg added in 9.6)
        const requestListener = args[args.length - 1];

        // Wrap request listener
        args[args.length - 1] = async (req, res) => {
          let filepath = urlToFilepath.get(req.url);

          pendingRequests.add(req.url);

          if (!filepath && isJsRequest(req)) {
            try {
              // Triggers bundling of bare imports
              filepath = await find(req, undefined, rollupOptions);
              matchUrlToFilepath(req.url, filepath, pendingRequests, urlToFilepath);
            } catch (err) {
              // ignore
            }
          }

          patchRequest(req);
          patchResponse(req, res, reload && reload.client);

          // Send js file if we found it, otherwise let application handle it
          if (filepath) {
            // watcher.add(filepath);
            return send(req, filepath, {
              cacheControl: false,
              dotfiles: 'allow'
            }).pipe(res);
          }

          requestListener(req, res);
        };

        server = Reflect.apply(target, ctx, args);
        server.timeout = server.keepAliveTimeout = 0;
        serverDestroy(server);

        server.on('error', (err) => {
          stop(state);
          reject(err);
        });
        server.on('listening', () => {
          debug('server started');
          clearTimeout(timeoutID);
          state.server = server;
          state.appModules = getAppModules();
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
      require(main);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Stop running server
 * @param {object} state
 * @returns {Promise<void>}
 */
function stop(state) {
  const { server } = state;

  return new Promise((resolve) => {
    if (!server) {
      return resolve();
    }

    server.removeAllListeners();
    server.destroy(() => {
      debug('server stopped');
      resolve();
    });
  });
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
