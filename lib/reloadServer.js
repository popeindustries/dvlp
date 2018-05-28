'use strict';

const { info } = require('./utils/log');
const { URL } = require('url');
const chalk = require('chalk');
const debug = require('debug')('dvlp:reload');
const fs = require('fs');
const http = require('http');
const path = require('path');
const SSE = require('sse');
// const WebSocket = require('ws');

const DELAY = 100;
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
  const [server, sse] = await start(port);
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
        const num = sse.clients.length;

        if (num) {
          debug(`sending reload command to ${num} connected clients`);
          info(`Reloading ${chalk.yellow(num)} connected client${num > 1 ? 's' : ''}`);
        }

        for (const client of sse.clients) {
          client.send({
            event: 'reload',
            data: refreshing,
            id: 'dvlp',
            retry: 500
          });
        }

        refreshing = undefined;
      }, DELAY);
    },

    destroy() {
      debug('destroying');
      stop(server, sse);
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
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/reloadClient.js') {
        res.setHeader('Content-type', 'text/javascript');
        fs.createReadStream(path.join(__dirname, './reloadClient.js')).pipe(res);
      } else {
        // All other requests 404
        res.writeHead(404);
        res.end();
      }
    });
    const sse = new SSE(server);

    sse.clients = [];
    sse.on('connection', (client) => {
      sse.clients.push(client);
    });
    server.on('error', (err) => reject(err));
    server.on('listening', () => resolve([server, sse]));

    debug('server started');

    server.listen(port);
  });
}

/**
 * Stop running server
 * @param {http.Server} server
 * @param {object} sse
 * @returns {Promise<void>}
 */
function stop(server, sse) {
  if (sse) {
    for (const client of sse.clients) {
      client.close();
    }
    sse.removeAllListeners();
    delete sse.server;
    delete sse.clients;
  }
  if (server) {
    server.removeAllListeners();
    server.close();
    debug('server stopped');
  }
}
