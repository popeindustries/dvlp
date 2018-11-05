'use strict';

const { info } = require('./utils/log');
const chalk = require('chalk');
const debug = require('debug')('dvlp:reload');
const fs = require('fs');
const http = require('http');
const path = require('path');
const decorateWithServerDestroy = require('server-destroy');

const DEFAULT_PORT = 3529;
const ENDPOINT = '/dvlpreload';
const RETRY = 10000;

const reloadClient = fs.readFileSync(
  path.resolve(__dirname, './utils/reloadClient.min.js'),
  'utf8'
);
let servers = 0;

/**
 * Create reload server
 * @returns {Promise<{ client: string, send: (string, object) => void, destroy: () => Promise<void> }>}
 */
module.exports = async function reloadServer() {
  const instance = new ReloadServer();

  await instance.start();

  return {
    client: reloadClient.replace(/PORT/g, instance.port),
    destroy: instance.destroy.bind(instance),
    send: instance.send.bind(instance),
    url: `http://localhost:${instance.port}${ENDPOINT}`
  };
};

class ReloadServer {
  /**
   * Constructor
   */
  constructor() {
    this.clients = new Set();
    this.port = DEFAULT_PORT + servers++;
    this.server = null;
  }

  /**
   * Start server
   * @returns {Promise<http.Server>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (req.url !== ENDPOINT) {
          res.writeHead(404);
          res.end();
        }

        const client = { req, res };

        this.clients.add(client);
        debug('added connection', this.clients.size);

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
          this.clients.delete(client);
          delete client.res;
          delete client.req;
          debug('removed connection', this.clients.size);
        });
      });

      this.server.timeout = this.server.keepAliveTimeout = 0;
      decorateWithServerDestroy(this.server);

      this.server.on('error', reject);
      this.server.on('listening', resolve);

      this.server.listen(this.port);
    });
  }

  /**
   * Send reload message to clients for changed 'filepath'
   * @param {string} filepath
   */
  send(filepath) {
    const extname = path.extname(filepath).slice(1);
    const event = extname === 'css' ? 'refresh' : 'reload';
    const data = { type: extname, filepath: path.basename(filepath) };

    if (this.clients.size) {
      info(
        `${chalk.yellow(`⟲  ${event}ing`)} ${this.clients.size} client${
          this.clients.size > 1 ? 's' : ''
        }`
      );

      for (const client of this.clients) {
        client.res.write(`event: ${event}\n`);
        client.res.write(`retry: ${RETRY}\n`);
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    }
  }

  /**
   * Stop running server
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.server) {
        return resolve();
      }

      this.server.removeAllListeners();
      this.server.destroy(() => {
        debug('server stopped');
        resolve();
      });
    });
  }

  /**
   * Destroy instance
   */
  destroy() {
    debug('destroying');
    for (const client of this.clients) {
      client.res.end();
    }
    this.clients.clear();
    return this.stop();
  }
}
