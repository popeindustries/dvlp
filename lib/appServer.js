'use strict';

const { find, getProjectPath, listenForFileRead, urlMatchesFilepath } = require('./utils/file');
const { info } = require('./utils/log');
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
  const instance = await factory(main, directories, reloader, rollupConfig, transpiler);

  info(
    `💥 serving ${chalk.green(mainpath)} at ${chalk.green.underline(`http://localhost:${port}`)}`
  );

  return instance;
};

/**
 * Factory for return instance
 * @param {string} main
 * @param {[string]} directories
 * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }} [reloader]
 * @param {object} [rollupConfig]
 * @param {(string) => string} [transpiler]
 * @returns {{ destroy: () => Promise<void> }}
 */
async function factory(main, directories, reloader, rollupConfig, transpiler) {
  const state = {
    appModules: [],
    directories,
    filepathToTranspiled: new Map(),
    lastChanged: '',
    main,
    pendingRequests: new Set(),
    reloader,
    rollupConfig,
    server: null,
    transpiler,
    unlistenForFileRead: null,
    urlToFilepath: new Map(),
    watcher: null
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
    const { appModules, reloader } = state;

    debug('restarting server');

    clearAppModules(appModules);

    try {
      await stop(state);
      await start(state);
      info(`⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(getProjectPath(filepath))}`);
    } catch (err) {
      console.error(err);
    }

    state.lastChanged = filepath;
    reloader && reloader.send(filepath);
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
  const {
    directories,
    main,
    pendingRequests,
    reloader,
    rollupConfig,
    transpiler,
    urlToFilepath,
    watcher
  } = state;

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

          if (!filepath) {
            try {
              // Triggers bundling of bare js imports
              filepath = await find(req, directories, rollupConfig);
              matchUrlToFilepath(req.url, filepath, pendingRequests, urlToFilepath);
            } catch (err) {
              // ignore
            }
          }

          patchRequest(req);
          patchResponse(req, res, reloader && reloader.client);

          // Send js file if we found it, otherwise let application handle it
          if (filepath) {
            watcher.add(filepath);
            transpiler && (await transpile(filepath, res, state));

            // Not transpiled
            if (!res.finished) {
              debug(`sending file "${getProjectPath(filepath)}"`);
              return send(req, filepath, {
                cacheControl: false,
                dotfiles: 'allow'
              }).pipe(res);
            }
          }

          // TODO: notify unable to find file
          // warn(`unable to resolve file for url "${req.url}"`);
          requestListener(req, res);
        };

        state.server = server = Reflect.apply(target, ctx, args);
        server.timeout = server.keepAliveTimeout = 0;
        decorateWithServerDestroy(server);

        server.on('error', (err) => {
          stop(state);
          reject(err);
        });
        server.on('listening', () => {
          debug('server started');
          clearTimeout(timeoutID);
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
