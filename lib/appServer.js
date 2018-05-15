'use strict';

const debug = require('debug')('dvlp:app');
const http = require('http');
const path = require('path');
const watch = require('./watch');

const DEFAULT_PORT = 8080;
const INJECTED_SCRIPT = '<script src="http://localhost:35729/livereload.js"></script>';
const RE_ACCEPT_HTML = /text\/html/i;
const RE_BODY_TAG = /<\/body>/i;
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

  const instance = await factory(path.resolve(mainpath), reloadServer, fn);

  debug(`Server started: http://localhost:${port}`);

  return instance;
};

/**
 * Start app server
 * @param {string} main
 * @returns {Promise<[string]>}
 */
function start(main) {
  return new Promise((resolve, reject) => {
    http.createServer = (...args) => {
      const server = originalCreateServer(...args);
      let oldEnd;

      server.on('error', reject);
      server.on('request', (req, res) => {
        res.on('data', (...args) => {
          console.log('data', args);
        });
        if (RE_ACCEPT_HTML.test(req.headers.accept)) {
          oldEnd = res.end;
          res.end = (...args) => {
            console.log(res.headersSent, res.getHeaders());
            if (typeof args[0] === 'string' && RE_BODY_TAG.test(args[0])) {
              args[0] = args[0].replace(RE_BODY_TAG, `${INJECTED_SCRIPT}\n</body>`);
              res.setHeader('content-length', Buffer.byteLength(args[0]));
            }
            return oldEnd.apply(res, args);
          };
        }
      });
      server.on('listening', () => resolve([server, getAppModules()]));

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
 * Stop running server
 * @param {http.Server} server
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
 * Clear app modules from module cache
 * @param {[string]} appModules
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

/**
 * Factory for return instance
 * @param {string} main
 * @param {object} reloadServer
 * @param {() => void} [fn]
 * @returns {{ destroy: () => void }}
 */
async function factory(main, reloadServer, fn) {
  let [server, appModules] = await start(main);
  const watcher = await watch(reloadServer ? process.cwd() : appModules, async (filepath) => {
    clearAppModules(appModules);

    try {
      await stop(server);

      const [newServer, newAppModules] = await start(main);

      for (const m of newAppModules) {
        if (!appModules.includes(m)) {
          watcher.add(m);
        }
      }

      server = newServer;
      appModules = newAppModules;

      debug(`Server restarted after change: ${path.basename(filepath)}`);
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
      clearAppModules(appModules);
      appModules = [];
      watcher.close();
      return stop(server);
    }
  };
}
