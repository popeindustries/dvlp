'use strict';

const http = require('http');
const path = require('path');
const watch = require('./watch');

const DEFAULT_PORT = 8080;
const RE_NODE_MODULES = /node_modules/;

const originalCreateServer = http.createServer;
let appModules = [];
let main, ownModules, server, watcher;

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
  if (server) {
    await destroy();
  }

  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }
  if (ownModules === undefined) {
    ownModules = Object.keys(require.cache);
  }

  main = path.resolve(mainpath);
  appModules = await start();
  watcher = watch(reloadServer ? process.cwd() : appModules, (filepath) => {
    if (reloadServer) {
      reloadServer.refresh(filepath);
      fn && fn();
    } else {
      restart(fn);
    }
  });

  return { destroy };
};

/**
 * Start app server
 * @returns {Promise<[string]>}
 */
function start() {
  return new Promise((resolve, reject) => {
    http.createServer = (...args) => {
      server = originalCreateServer(...args);

      server.on('error', reject);
      server.on('listening', resolve);

      http.createServer = originalCreateServer;

      return server;
    };

    try {
      require(main);
      resolve(getAppModules());
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Restart app server
 * @param {() => void} [fn]
 */
async function restart(fn) {
  clearAppModules();

  try {
    await stop();

    const newAppModules = await start();

    for (const m of newAppModules) {
      if (!appModules.includes(m)) {
        watcher.add(m);
      }
    }

    appModules = newAppModules;
    fn && fn();
  } catch (err) {
    console.error(err);
  }
}

function stop() {
  return new Promise((resolve) => {
    server.close((err) => {
      server = undefined;
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
  watcher && watcher.close();
  watcher = undefined;
  return stop();
}

function clearAppModules() {
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
    (modulepath) => !ownModules.includes(modulepath) && !RE_NODE_MODULES.test(modulepath)
  );
}
