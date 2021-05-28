import chalk from 'chalk';
import config from '../config.js';
import Debug from 'debug';
import { EventSource } from './event-source.js';
import { getTypeFromPath } from '../utils/file.js';
import { noisyInfo } from '../utils/log.js';

const debug = Debug('dvlp:es');

export default class EventSourceServer {
  constructor() {
    /** @type { Set<EventSource> } */
    this.clients = new Set();
  }

  /**
   * Register new client connection
   *
   * @param { IncomingMessage | Http2ServerRequest } req
   * @param { ServerResponse | Http2ServerResponse } res
   * @returns { void }
   */
  registerClient(req, res) {
    const client = new EventSource(req, res);

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
      noisyInfo(`${chalk.yellow(`  ⟲ ${event}ing`)} ${this.clients.size} client${this.clients.size > 1 ? 's' : ''}`);

      for (const client of this.clients) {
        client.send(data, { event });
      }
    }
  }

  /**
   * Determine if "req" should be handled by reload server
   *
   * @param { IncomingMessage | Http2ServerRequest } req
   * @returns { req is Req }
   */
  isReloadRequest(req) {
    return (req.url && req.url.startsWith(config.reloadEndpoint)) || EventSource.isEventSource(req);
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
}
