'use strict';

const chalk = require('chalk');
const debug = require('debug')('dvlp:reload');
const decorateWithServerDestroy = require('server-destroy');
const { EventSource } = require('faye-websocket');
const fs = require('fs');
const getPort = require('get-port');
const { getTypeFromPath } = require('../utils/file.js');
const http = require('http');
const { noisyInfo } = require('../utils/log.js');
const path = require('path');

const DEFAULT_CLIENT_CONFIG = {
  headers: { 'Access-Control-Allow-Origin': '*' },
  ping: 15,
  retry: 10,
};
const DEFAULT_PORT = 3529;
const ENDPOINT = '/dvlpreload';

const reloadClient =
  global.$RELOAD_CLIENT ||
  fs.readFileSync(path.resolve(__dirname, 'reload-client.js'), 'utf8');

/**
 * Create reload server
 *
 * @returns { Promise<Reloader> }
 */
module.exports = async function reloadServer() {
  const port = await getPort({
    port: getPort.makeRange(DEFAULT_PORT, DEFAULT_PORT + 100),
  });
  const server = new ReloadServer(port);
  const client = reloadClient.replace(/\$RELOAD_PORT/g, String(port));

  await server.start();

  return {
    client,
    destroy: server.destroy.bind(server),
    send: server.send.bind(server),
    url: `http://localhost:${server.port}${ENDPOINT}`,
  };
};

class ReloadServer {
  /**
   * Constructor
   *
   * @param { number } port
   */
  constructor(port) {
    /** @type { Set<EventSource> } */
    this.clients = new Set();
    this.port = port;
    this.server;
  }

  /**
   * Start server
   *
   * @returns { Promise<void> }
   */
  start() {
    return new Promise((resolve, reject) => {
      /** @type { DestroyableHttpServer } */
      this.server = http.createServer(async (req, res) => {
        // @ts-ignore
        if (req.url !== ENDPOINT || !EventSource.isEventSource(req)) {
          res.writeHead(404);
          res.end();
          return;
        }

        // @ts-ignore
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
        `${chalk.yellow(`  ⟲ ${event}ing`)} ${this.clients.size} client${
          this.clients.size > 1 ? 's' : ''
        }`,
      );

      for (const client of this.clients) {
        // @ts-ignore
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
      // @ts-ignore
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