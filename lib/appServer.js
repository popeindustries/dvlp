'use strict';

const { find } = require('./utils/file');
const { isJsModuleRequest } = require('./utils/is');
const { log } = require('./utils/log');
const { patchRequest, patchResponse } = require('./utils/patch');
const chalk = require('chalk');
const debug = require('debug')('dvlp:app');
const http = require('http');
const path = require('path');
const send = require('send');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;
const RE_NODE_MODULES = /node_modules/;
const TIMEOUT_DURATION = 2000;

const originalCreateServer = http.createServer;
let ownModules;

/**
 * Create app server
 * @param {string} mainpath
 * @param {{ port: number, reloadServer: object, rollupConfig: object }} [options]
 * @param {() => void} [fn]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function appServer(
  mainpath,
  { port = DEFAULT_PORT, reloadServer, rollupConfig } = {},
  fn
) {
  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }
  if (ownModules === undefined) {
    ownModules = Object.keys(require.cache);
  }

  const instance = await factory(path.resolve(mainpath), reloadServer, rollupConfig, fn);

  log(`  Serving ${chalk.green(mainpath)} at ${chalk.green.underline(`http://localhost:${port}`)}`);

  return instance;
};

/**
 * Start app server.
 * Proxies createServer to grab instance and register for events,
 * then requires main to trigger application bootstrap
 * @param {string} main
 * @param {boolean} isReloading
 * @param {object} [rollupConfig]
 * @returns {Promise<[string]>}
 */
function start(main, isReloading, rollupConfig) {
  return new Promise((resolve, reject) => {
    // Force reject if never started
    const timeoutID = setTimeout(() => {
      stop(server);
      reject(Error('unable to start server'));
    }, TIMEOUT_DURATION);
    let server;

    http.createServer = new Proxy(http.createServer, {
      apply(target, ctx, args) {
        // Always last arg ('options' as first arg added in 9.6)
        const requestListener = args[args.length - 1];

        // Wrap request listener
        args[args.length - 1] = async (req, res) => {
          let filepath;

          if (isJsModuleRequest(req)) {
            try {
              // Triggers bundling
              filepath = await find(req, undefined, rollupConfig);
            } catch (err) {
              // ignore
            }
          }

          patchRequest(req);
          patchResponse(req, res, isReloading);

          // Send js file if we found it, otherwise let application handle it
          if (filepath) {
            send(req, filepath, {
              cacheControl: false,
              dotfiles: 'allow'
            }).pipe(res);
          } else {
            requestListener(req, res);
          }
        };

        server = Reflect.apply(target, ctx, args);

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

    const timeoutID = setTimeout(() => {
      resolve();
    }, TIMEOUT_DURATION);

    server.close((err) => {
      clearTimeout(timeoutID);
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
 * @param {object} [rollupConfig]
 * @param {() => void} [fn]
 * @returns {{ destroy: () => void }}
 */
async function factory(main, reloadServer, rollupConfig, fn) {
  const isReloading = reloadServer !== undefined;
  let [server, appModules] = await start(main, isReloading, rollupConfig);
  const watcher = await watch(reloadServer ? process.cwd() : appModules, async (filepath) => {
    debug('restarting server');

    clearAppModules(appModules);

    try {
      await stop(server);

      const [newServer, newAppModules] = await start(main, isReloading, rollupConfig);

      for (const m of newAppModules) {
        if (!appModules.includes(m)) {
          debug(`watching module ${m}`);
          watcher.add(m);
        }
      }

      server = newServer;
      appModules = newAppModules;

      log(
        `  [${new Date().toLocaleTimeString()}] ${chalk.yellow('changed')} ${path.basename(
          filepath
        )}`
      );
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
