'use strict';

const { eavesdropOnRead, find } = require('./utils/file');
const { info } = require('./utils/log');
const { isJsRequest } = require('./utils/is');
const { patchRequest, patchResponse } = require('./utils/patch');
const chalk = require('chalk');
const debug = require('debug')('dvlp:app');
const http = require('http');
const path = require('path');
const send = require('send');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;
const RE_NODE_MODULES = /node_modules/;
const START_TIMEOUT_DURATION = 2000;

const originalCreateServer = http.createServer;
let dvlpModules;

/**
 * Create app server
 * @param {string} mainpath
 * @param {{ port: number, reloadServer: object, rollupOptions: object }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function appServer(
  mainpath,
  { port = DEFAULT_PORT, reloadServer, rollupOptions } = {}
) {
  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }
  if (dvlpModules === undefined) {
    dvlpModules = Object.keys(require.cache);
  }

  const instance = await factory(path.resolve(mainpath), reloadServer, rollupOptions);

  info(`Serving ${chalk.green(mainpath)} at ${chalk.green.underline(`http://localhost:${port}`)}`);

  return instance;
};

/**
 * Factory for return instance
 * @param {string} main
 * @param {object} reloadServer
 * @param {object} [rollupOptions]
 * @returns {{ destroy: () => void }}
 */
async function factory(main, reloadServer, rollupOptions) {
  const reloadOptions = {
    isReloading: reloadServer !== undefined,
    reloadPort: reloadServer ? reloadServer.port : undefined
  };
  const watcher = await watch(async (filepath) => {
    debug('restarting server');

    clearAppModules(appModules);

    try {
      stop(server);
      [server, appModules] = await start(main, watcher, reloadOptions, rollupOptions);
      info(
        `[${new Date().toLocaleTimeString()}] ${chalk.yellow('changed')} ${path.basename(filepath)}`
      );
    } catch (err) {
      console.error(err);
    }

    reloadServer && reloadServer.refresh(filepath);
  });

  // Listen for all upcoming file system reads and add to watcher
  // (including require('*'))
  eavesdropOnRead(process.cwd(), (filepath) => {
    watcher.add(filepath);
  });

  let [server, appModules] = await start(main, watcher, reloadOptions, rollupOptions);

  return {
    destroy() {
      debug('destroying');
      clearAppModules(appModules);
      appModules = [];
      watcher.close();
      stop(server);
      return Promise.resolve();
    }
  };
}

/**
 * Start app server.
 * Proxies createServer to grab instance and register for events,
 * then requires main to trigger application bootstrap
 * @param {string} main
 * @param {object} [watcher]
 * @param {{ isReloading: boolean, reloadPort: number }} [reloadOptions]
 * @param {object} [rollupOptions]
 * @returns {Promise<[http.Server, [string]]>}
 */
function start(main, watcher, reloadOptions, rollupOptions) {
  return new Promise((resolve, reject) => {
    // Force reject if never started
    const timeoutID = setTimeout(() => {
      debug('timeout: server started');
      stop(server);
      reject(Error('unable to start server'));
    }, START_TIMEOUT_DURATION);
    let server;

    http.createServer = new Proxy(http.createServer, {
      apply(target, ctx, args) {
        // Always last arg ('options' as first arg added in 9.6)
        const requestListener = args[args.length - 1];

        // Wrap request listener
        args[args.length - 1] = async (req, res) => {
          let filepath;

          if (isJsRequest(req)) {
            try {
              // Triggers bundling
              filepath = await find(req, undefined, rollupOptions);
            } catch (err) {
              // ignore
            }
          }

          patchRequest(req);
          patchResponse(req, res, reloadOptions);

          // Send js file if we found it, otherwise let application handle it
          if (filepath) {
            watcher.add(filepath);
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
  if (server) {
    server.removeAllListeners();
    server.close();
    debug('server stopped');
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
