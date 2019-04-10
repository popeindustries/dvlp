'use strict';

/**
 * @typedef { object } reloadServer
 * @property { string } client
 * @property { string } clientHash
 * @property { () => Promise<void> } destroy
 * @property { (string, object) => void } send
 * @property { string } url
 */

const chalk = require('chalk');
const crypto = require('crypto');
const debug = require('debug')('dvlp:reload');
const decorateWithServerDestroy = require('server-destroy');
const { EventSource } = require('faye-websocket');
const fs = require('fs');
const { getTypeFromPath } = require('../utils/file.js');
const http = require('http');
const { noisyInfo } = require('../utils/log.js');
const path = require('path');

const DEFAULT_CLIENT_CONFIG = {
  headers: { 'Access-Control-Allow-Origin': '*' },
  ping: 15,
  retry: 10
};
const DEFAULT_PORT = 3529;
const ENDPOINT = '/dvlpreload';

const reloadClient =
  global.$RELOAD_CLIENT ||
  fs.readFileSync(path.resolve(__dirname, 'reload-client.js'), 'utf8');
let servers = 0;

/**
 * Create reload server
 *
 * @returns { Promise<reloadServer> }
 */
module.exports = async function reloadServer() {
  const server = new ReloadServer();
  const client = reloadClient.replace(/\$RELOAD_PORT/g, server.port);
  const clientHash = crypto
    .createHash('sha256')
    .update(client)
    .digest('base64');

  await server.start();

  return {
    client,
    clientHash,
    destroy: server.destroy.bind(server),
    send: server.send.bind(server),
    url: `http://localhost:${server.port}${ENDPOINT}`
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
   *
   * @returns { Promise<void> }
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (req.url !== ENDPOINT || !EventSource.isEventSource(req)) {
          res.writeHead(404);
          res.end();
          return;
        }

        const client = new EventSource(req, res, DEFAULT_CLIENT_CONFIG);

        this.clients.add(client);
        debug('added reload connection', this.clients.size);

        client.on('close', () => {
          this.clients.delete(client);
          debug('removed reload connection', this.clients.size);
        });
      });

      decorateWithServerDestroy(this.server);
      this.server.timeout = this.server.keepAliveTimeout = 0;
      this.server.unref();
      this.server.on('error', reject);
      this.server.on('listening', resolve);

      this.server.listen(this.port);
    });
  }

  /**
   * Send reload message to clients for changed 'filePath'
   *
   * @param { string } filePath
   * @returns { void }
   */
  send(filePath) {
    const type = getTypeFromPath(filePath);
    const event = type === 'css' ? 'refresh' : 'reload';
    const data = JSON.stringify({ type, filePath });

    if (this.clients.size) {
      noisyInfo(
        `${chalk.yellow(`⟲  ${event}ing`)} ${this.clients.size} client${
          this.clients.size > 1 ? 's' : ''
        }`
      );

      for (const client of this.clients) {
        client.send(data, { event });
      }
    }
  }

  /**
   * Stop running server
   *
   * @returns { Promise<void> }
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
   *
   * @returns { Promise<void> }
   */
  destroy() {
    debug('destroying');
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    return this.stop();
  }
}
