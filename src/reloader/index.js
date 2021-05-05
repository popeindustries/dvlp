import config from '../config.js';
import Debug from 'debug';
import decorateWithServerDestroy from 'server-destroy';
import EventSourceServer from './event-source-server.js';
import { getDeterministicPort } from '../utils/port.js';
import { getReloadClientEmbed } from './reload-client-embed.js';
import http from 'http';

const PORT_FINGERPRINT = `${process.cwd()} ${process.argv.slice(2).join(' ')}`;

const debug = Debug('dvlp:reload');

/**
 * Create reload server
 *
 * @returns { Promise<_dvlp.Reloader> }
 */
export async function reloadServer() {
  const server = new ReloadServer();

  await server.start();

  return {
    destroy: server.destroy.bind(server),
    send: server.send.bind(server),
    reloadEmbed: getReloadClientEmbed(server.port),
    reloadPort: server.port,
    reloadUrl: `http://localhost:${server.port}${config.reloadEndpoint}`,
  };
}

class ReloadServer extends EventSourceServer {
  constructor() {
    super();

    this.port = getDeterministicPort(PORT_FINGERPRINT, 3500, 7999);
    this.server;
  }

  /**
   * Start server
   *
   * @returns { Promise<void> }
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // @ts-ignore
        if (!this.isReloadRequest(req)) {
          res.writeHead(404);
          res.end();
          return;
        }

        super.registerClient(req, res);
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
    super.destroy();
    return this.stop();
  }
}
