'use strict';

const { server: WSServer } = require('websocket');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ReloadConnection = require('./ReloadConnection');
const url = require('url');

const DELAY = 500;
const DEFAULT_FILEPATH = 'foo.js';
const PORT = 35729;

let connectionId = 0;
let connections = {};
let refreshing, server, wsServer;

/**
 * Create reload server
 * @returns {Promise<{ refresh: (string) => void, destroy: () => void }>}
 */
module.exports = async function reloadServer() {
  if (server) {
    await destroy();
  }

  return new Promise((resolve, reject) => {
    const port = PORT;
    const options = {
      id: 'com.popeindustries.dvlp',
      name: 'dvlp-livereload',
      version: '1.0',
      port
    };

    server = http.createServer((req, res) => {
      const uri = url.parse(req.url, true);

      if (uri.pathname === '/livereload.js') {
        res.setHeader('Content-type', 'text/javascript');
        fs.createReadStream(path.join(__dirname, '../vendor/livereload.js')).pipe(res);
      } else {
        // All other requests 404
        res.writeHead(404);
        res.end();
      }
    });
    wsServer = new WSServer({
      httpServer: server,
      autoAcceptConnections: true
    });

    wsServer.on('connect', (socket) => createConnection(socket, options));
    server.on('error', (err) => reject(err));
    server.on('listening', () => resolve({ refresh, destroy }));

    server.listen(port);
  });
};

/**
 * Refresh connected clients
 * @param {string} filepath
 */
function refresh(filepath = DEFAULT_FILEPATH) {
  filepath = path.basename(filepath);

  if (refreshing !== undefined) {
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

    for (const connection in connections) {
      if (connection.isActive()) {
        connection.send(msg);
      }
    }

    refreshing = undefined;
  }, DELAY);
}

/**
 * Destroy the active servers
 * @returns {Promise<void>}
 */
function destroy() {
  return new Promise((resolve) => {
    for (const connection in connections) {
      connection.close();
    }
    connections = {};
    wsServer.shutDown();
    wsServer = undefined;
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
 * Create connection instance
 * @param {object} socket
 * @param {object} options
 * @returns {ReloadConnection}
 */
function createConnection(socket, options) {
  const connection = new ReloadConnection(socket, `dvlp${++connectionId}`, options);

  connection.on('connected', () => {
    connections[connection.id] = connection;
  });
  connection.on('disconnected', () => {
    delete connections[connection.id];
  });

  return connection;
}
