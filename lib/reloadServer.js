'use strict';

const { info } = require('./utils/log');
const { server: WSServer } = require('websocket');
const { URL } = require('url');
const chalk = require('chalk');
const debug = require('debug')('dvlp:reload');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ReloadConnection = require('./ReloadConnection');

const DELAY = 500;
const DEFAULT_FILEPATH = 'foo.js';
const DEFAULT_PORT = 35729;

let servers = 0;

/**
 * Create reload server
 * @param {{ port: number }} [options]
 * @returns {Promise<{ refresh: (string) => void, destroy: () => void }>}
 */
module.exports = async function reloadServer({ port = DEFAULT_PORT + servers++ } = {}) {
  const instance = await factory(port);

  info('Ready to reload');
  return instance;
};

/**
 * Factory for return instance
 * @param {number} port
 * @returns {{ port: number, refresh: (string) => void, destroy: () => void }}
 */
async function factory(port) {
  const [server, wsServer, connections] = await start(port);
  let refreshing;

  return {
    port,

    refresh(filepath = DEFAULT_FILEPATH) {
      filepath = path.basename(filepath);

      debug(`refreshing ${filepath}`);

      if (refreshing !== undefined) {
        debug('forcing reload after multiple refreshes');
        // Force full refresh if multiple changed files
        refreshing = DEFAULT_FILEPATH;
        return;
      }

      refreshing = filepath;

      // Debounce
      setTimeout(() => {
        const msg = {
          command: 'reload',
          path: refreshing,
          liveCSS: true
        };
        const num = Object.keys(connections).length;

        if (num) {
          debug(`sending reload command to ${num} connected clients`);
          info(`Reloading ${chalk.yellow(num)} connected client${num > 1 ? 's' : ''}`);
        }

        for (const id in connections) {
          const connection = connections[id];

          if (connection.isActive()) {
            connection.send(msg);
          }
        }

        refreshing = undefined;
      }, DELAY);
    },

    destroy() {
      debug('destroying');
      for (const id in connections) {
        connections[id].close();
      }
      return stop(server, wsServer);
    }
  };
}

/**
 * Start reload server
 * @param {number} port
 * @returns {Promise<[http.Server, object, object]}
 */
function start(port) {
  return new Promise((resolve, reject) => {
    const options = {
      id: 'com.popeindustries.dvlp',
      name: 'dvlp-livereload',
      version: '1.0',
      port
    };
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/livereload.js') {
        res.setHeader('Content-type', 'text/javascript');
        fs.createReadStream(path.join(__dirname, '../vendor/livereload.js')).pipe(res);
      } else {
        // All other requests 404
        res.writeHead(404);
        res.end();
      }
    });
    const wsServer = new WSServer({
      httpServer: server,
      autoAcceptConnections: true
    });
    let connectionId = 0;
    let connections = {};

    wsServer.on('connect', (socket) =>
      createConnection(socket, ++connectionId, connections, options)
    );
    server.on('error', (err) => reject(err));
    server.on('listening', () => resolve([server, wsServer, connections]));

    debug('server started');

    server.listen(port);
  });
}

/**
 * Stop running server
 * @returns {Promise<void>}
 */
function stop(server, wsServer) {
  return new Promise((resolve) => {
    if (!server) {
      return resolve();
    }

    if (wsServer) {
      wsServer.removeAllListeners();
      wsServer.shutDown();
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
 * Create connection instance
 * @param {object} socket
 * @param {number} id
 * @param {object} connections
 * @param {object} options
 * @returns {ReloadConnection}
 */
function createConnection(socket, id, connections, options) {
  const connection = new ReloadConnection(socket, `dvlp${id}`, options);

  debug('creating reload connection:', connection.id);

  connection.on('connected', () => {
    connections[connection.id] = connection;
  });
  connection.on('disconnected', () => {
    connection.removeAllListeners();
    connection.close();
    delete connections[connection.id];
  });

  return connection;
}
