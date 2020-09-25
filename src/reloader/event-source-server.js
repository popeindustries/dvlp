'use strict';

const chalk = require('chalk');
const config = require('../config.js');
const debug = require('debug')('dvlp:es');
const { EventSource } = require('faye-websocket');
const { getTypeFromPath } = require('../utils/file.js');
const { noisyInfo } = require('../utils/log.js');

const DEFAULT_CLIENT_CONFIG = {
  headers: { 'Access-Control-Allow-Origin': '*' },
  ping: 15,
  retry: 10,
};

module.exports = class EventSourceServer {
  constructor() {
    /** @type { Set<EventSource> } */
    this.clients = new Set();
  }

  /**
   * Register new client connection
   *
   * @param { IncomingMessage } req
   * @param { ServerResponse } res
   * @returns { void }
   */
  registerClient(req, res) {
    // @ts-ignore
    const client = new EventSource(req, res, DEFAULT_CLIENT_CONFIG);

    this.clients.add(client);
    debug('added reload connection', this.clients.size);

    client.on('close', () => {
      this.clients.delete(client);
      debug('removed reload connection', this.clients.size);
    });
  }

  /**
   * Send refresh/reload message to clients for changed 'filePath'
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
   * Determine if "req" should be handled by reload server
   *
   * @param { Req } req
   * @returns { boolean }
   */
  isReloadRequest(req) {
    return (
      req.url.startsWith(config.reloadEndpoint) ||
      // @ts-ignore
      EventSource.isEventSource(req)
    );
  }

  /**
   * Destroy clients
   *
   * @returns { void }
   */
  destroy() {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
};
