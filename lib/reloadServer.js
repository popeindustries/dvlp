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

/**
 * Create reload server
 * @returns {Promise<{ refresh: (string) => void, destroy: () => void }>}
 */
module.exports = function reloadServer() {
  return new Promise((resolve, reject) => {
    const port = PORT;
    const options = {
      id: 'com.popeindustries.dvlp',
      name: 'dvlp-livereload',
      version: '1.0',
      port
    };
    const connections = {};
    const server = http.createServer((req, res) => {
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
    const wsServer = new WSServer({
      httpServer: server,
      autoAcceptConnections: true
    });
    const api = {
      /**
       * Refresh connected clients
       * @param {string} filepath
       */
      refresh(filepath = DEFAULT_FILEPATH) {
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
            path: path.basename(refreshing),
            liveCSS: true
          };

          for (const connection in connections) {
            if (connection.isActive()) {
              connection.send(msg);
            }
          }

          refreshing = undefined;
        }, DELAY);
      },
      /**
       * Destroy the active servers
       */
      destroy() {
        for (const connection in connections) {
          connection.close();
        }

        try {
          wsServer.shutDown();
          server.close();
        } catch (err) {
          // ignore
        }
      }
    };
    let refreshing;

    wsServer.on('connect', (socket) => createConnection(socket, connections, options));
    server.on('error', (err) => reject(err));
    server.on('listening', () => resolve(api));

    server.listen(port);
  });
};

/**
 * Create connection instance
 * @param {object} socket
 * @param {object} connections
 * @param {object} options
 * @returns {ReloadConnection}
 */
function createConnection(socket, connections, options) {
  const connection = new ReloadConnection(socket, `dvlp${++connectionId}`, options);

  connection.on('connected', () => {
    connections[connection.id] = connection;
  });
  connection.on('disconnected', () => {
    delete connections[connection.id];
  });

  return connection;
}
