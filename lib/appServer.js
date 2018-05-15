'use strict';

const http = require('http');
const path = require('path');
const watch = require('./watch');

const DEFAULT_PORT = 8080;
const RE_NODE_MODULES = /node_modules/;

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

  return factory(path.resolve(mainpath), reloadServer, fn);
};

async function factory(main, reloadServer, fn) {
  const server = await start(main);
  let appModules = getAppModules();
  const watcher = await watch(reloadServer ? process.cwd() : appModules, (filepath) => {
    if (reloadServer) {
      reloadServer.refresh(filepath);
      fn && fn();
    } else {
      appModules = restart(server, watcher, appModules, fn);
    }
  });
  return {};
}

/**
 * Start app server
 * @returns {Promise<[string]>}
 */
function start(main) {
  return new Promise((resolve, reject) => {
    http.createServer = (...args) => {
      const server = originalCreateServer(...args);

      server.on('error', reject);
      server.on('listening', () => {
        resolve(server);
      });

      http.createServer = originalCreateServer;

      return server;
    };

    try {
      require(main);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Restart app server
 * @param {() => void} [fn]
 */
async function restart(server, watcher, appModules, fn) {
  clearAppModules(appModules);

  try {
    await stop(server);

    const newAppModules = await start();

    for (const m of newAppModules) {
      if (!appModules.includes(m)) {
        watcher.add(m);
      }
    }

    fn && fn();
    return newAppModules;
  } catch (err) {
    console.error(err);
  }
}

/**
 * Stop running server
 * @returns {Promise<void>}
 */
function stop(server) {
  return new Promise((resolve) => {
    server.close((err) => {
      if (err) {
        // ignore
      }
      resolve();
    });
  });
}

/**
 * Destroy the active server
 * @returns {Promise<void>}
 */
function destroy() {
  clearAppModules();
  appModules = [];
  main = '';
  watcher.close();
  watcher = undefined;
  return stop();
}

/**
 * Clear app modules from module cache
 */
function clearAppModules(appModules) {
  for (const m of appModules) {
    require.cache[m] = undefined;
  }
}

/**
 * Retrieve app modules (excluding node_modules)
 * @returns {[string]}
 */
function getAppModules() {
  return Object.keys(require.cache).filter(
    (m) => !ownModules.includes(m) && !RE_NODE_MODULES.test(m)
  );
}
