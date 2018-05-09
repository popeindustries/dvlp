'use strict';

const { server: WSServer } = require('websocket');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ReloadConnection = require('./ReloadConnection');
const url = require('url');

const PORT = 35729;

let connectionId = 0;

/**
 * Create reload server
 * @returns {Promise<{ destroy: () => void }>}
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
        // All other requests 404
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const wsServer = new WSServer({
      httpServer: server,
      autoAcceptConnections: true
    });

    wsServer.on('connect', (socket) => createConnection(socket, connections, options));
    server.on('error', (err) => {
      reject(err);
    });
    server.on('listening', () => {
      resolve({
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
      });
    });

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
