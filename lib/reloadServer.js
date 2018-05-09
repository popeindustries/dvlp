'use strict';

const { server: WSServer } = require('websocket');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ReloadConnection = require('./ReloadConnection');
const url = require('url');

const PORT = 35729;

let connectionId = 0;

module.exports = function reloadServer() {
  return new Promise((resolve) => {
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
    server.listen(port, () => {
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
