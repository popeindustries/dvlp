'use strict';

const { info } = require('./utils/log');
const debug = require('debug')('dvlp:reload');
const fs = require('fs');
const http = require('http');
const path = require('path');
const serverDestroy = require('server-destroy');

const DEFAULT_PORT = 3529;
const RETRY = 10000;

const reloadClient = fs.readFileSync(path.resolve(__dirname, './utils/reloadClient.js'), 'utf8');
let servers = 0;

/**
 * Create reload server
 * @returns {Promise<{ client: string, send: (string, object) => void, destroy: () => Promise<void> }>}
 */
module.exports = async function reloadServer() {
  const instance = await factory();

  info('ready to reload');

  return instance;
};

/**
 * Factory for return instance
 * @returns {{ destroy: () => void }}
 */
async function factory() {
  const clients = new Set();
  const port = DEFAULT_PORT + servers++;
  const server = await start(port, clients);

  return {
    client: reloadClient.replace(/PORT/g, port),

    /**
     * Send reload/refresh events to clients
     * @param {string} filepath
     */
    send(filepath) {
      const extname = path.extname(filepath).slice(1);
      const event = extname === 'css' ? 'refresh' : 'reload';
      const data = { type: extname, filepath: path.basename(filepath) };

      debug(`sending ${event} event to ${clients.size} clients`);

      for (const client of clients) {
        client.res.write(`event: ${event}\n`);
        client.res.write(`retry: ${RETRY}\n`);
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    },
    destroy() {
      debug('destroying');
      for (const client of clients) {
        client.res.end();
      }
      clients.clear();
      return stop(server);
    }
  };
}

/**
 * Start server
 * @param {number} port
 * @param {Set} clients
 * @returns {Promise<http.Server>}
 */
function start(port, clients) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.url !== '/reload') {
        res.writeHead(404);
        res.end();
      }

      const client = { req, res };

      clients.add(client);
      debug('added connection', clients.size);

      req.socket.setNoDelay(true);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=UTF-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(':ok\n\n');

      res.on('close', () => {
        res.removeAllListeners();
        clients.delete(client);
        delete client.res;
        delete client.req;
        debug('removed connection', clients.size);
      });
    });

    server.timeout = server.keepAliveTimeout = 0;
    serverDestroy(server);

    server.on('error', reject);
    server.on('listening', () => resolve(server));

    server.listen(port);
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
      return resolve();
    }

    server.removeAllListeners();
    server.destroy(() => {
      debug('server stopped');
      resolve();
    });
  });
}
