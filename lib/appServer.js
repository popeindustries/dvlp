'use strict';

const { injectReloadScript, isHtmlRequest, isJsRequest, log, watch } = require('./utils');
const debug = require('debug')('dvlp:app');
const http = require('http');
const path = require('path');

const DEFAULT_PORT = 8080;
const RE_NODE_MODULES = /node_modules/;
const TIMEOUT_DURATION = 2000;

const originalCreateServer = http.createServer;
let ownModules;

/**
 * Create app server
 * @param {string} mainpath
 * @param {{ port: number, reloadServer: object }} [options]
 * @param {() => void} [fn]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function appServer(
  mainpath,
  { port = DEFAULT_PORT, reloadServer } = {},
  fn
) {
  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }
  if (ownModules === undefined) {
    ownModules = Object.keys(require.cache);
  }

  const instance = await factory(path.resolve(mainpath), reloadServer, fn);

  log(`  Serving "${mainpath}" at http://localhost:${port}`);

  return instance;
};

/**
 * Start app server.
 * Proxies createServer to grab instance and register for events,
 * then requires main to trigger application bootstrap
 * @param {string} main
 * @param {boolean} isReloading
 * @returns {Promise<[string]>}
 */
function start(main, isReloading) {
  return new Promise((resolve, reject) => {
    // Force reject if never started
    const timeoutID = setTimeout(() => {
      stop(server);
      reject(Error('unable to start server'));
    }, TIMEOUT_DURATION);
    let server;

    http.createServer = new Proxy(http.createServer, {
      apply(target, ctx, args) {
        const hasOptions = args.length === 2;
        // Always last arg
        const requestListener = args[args.length - 1];

        server = Reflect.apply(target, ctx, [
          hasOptions ? args[0] : {},
          // Wrap request listener
          (req, res) => {
            if (isJsRequest(req)) {
              debug(`fixing js request for "${req.url}"`);
              // Some browsers specify module type as '*/*', so fix
              req.headers.accept = 'application/javascript';
              // Fix missing extension
              if (!path.extname(req.url)) {
                req.url += '.js';
                // TODO: support .mjs
              }
            }
            if (isReloading && isHtmlRequest(req)) {
              debug(`handling html request for "${req.url}"`);
              injectReloadScript(res);
            }

            requestListener(req, res);
          }
        ]);

        server.on('error', (err) => {
          stop(server);
          reject(err);
        });
        server.on('listening', () => {
          debug('server started');
          clearTimeout(timeoutID);
          resolve([server, getAppModules()]);
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
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function stop(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
    }

    server.close((err) => {
      server.removeAllListeners();
      if (err) {
        // ignore
      }
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
    (m) => !ownModules.includes(m) && !RE_NODE_MODULES.test(m)
  );

  debug(`found ${modules.length} app modules`);

  return modules;
}

/**
 * Factory for return instance
 * @param {string} main
 * @param {object} reloadServer
 * @param {() => void} [fn]
 * @returns {{ destroy: () => void }}
 */
async function factory(main, reloadServer, fn) {
  const isReloading = reloadServer !== undefined;
  let [server, appModules] = await start(main, isReloading);
  const watcher = await watch(reloadServer ? process.cwd() : appModules, async (filepath) => {
    debug('restarting server');

    clearAppModules(appModules);

    try {
      await stop(server);

      const [newServer, newAppModules] = await start(main, isReloading);

      for (const m of newAppModules) {
        if (!appModules.includes(m)) {
          debug(`watching module ${m}`);
          watcher.add(m);
        }
      }

      server = newServer;
      appModules = newAppModules;

      log(`  Change detected: "${path.basename(filepath)}"`);
    } catch (err) {
      console.error(err);
    }

    if (reloadServer) {
      reloadServer.refresh(filepath);
    }

    fn && fn();
  });

  return {
    destroy() {
      debug('destroying');
      clearAppModules(appModules);
      appModules = [];
      watcher.close();
      return stop(server);
    }
  };
}
