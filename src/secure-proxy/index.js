import { error, fatal, warn } from '../utils/log.js';
import { Certificate } from '@fidm/x509';
import config from '../config.js';
import decorateWithServerDestroy from 'server-destroy';
import EventSourceServer from '../reloader/event-source-server.js';
import fs from 'fs';
import { getDirectoryContents } from '../utils/file.js';
import { getReloadClientEmbed } from '../reloader/reload-client-embed.js';
import http2 from 'http2';
import path from 'path';
import undici from 'undici';

/**
 * Create secure proxy server.
 * Implements Reloader behaviour to handle registering reload clients if "reload=true".
 *
 * @param { string | Array<string> } certsPath
 * @param { boolean } reload
 * @returns { Promise<_dvlp.SecureProxy> }
 */
export default async function secureProxy(certsPath, reload) {
  const serverOptions = resolveCerts(certsPath);
  const commonName = validateCert(serverOptions.cert);
  const server = new SecureProxyServer(reload);

  await server.start(serverOptions);

  return {
    commonName,
    destroy: server.destroy.bind(server),
    reloadEmbed: getReloadClientEmbed(443),
    reloadPort: 443,
    reloadUrl: `https://localhost:${443}${config.reloadEndpoint}`,
    send: server.send.bind(server),
    /**
     * @param { number } port
     */
    setApplicationPort(port) {
      server.applicationPort = port;
    },
  };
}

class SecureProxyServer extends EventSourceServer {
  /**
   * Constructor
   *
   * @param { boolean } reload
   */
  constructor(reload) {
    super();
    this.reload = reload;
    this.server;
    /** @type { import('undici').Client } */
    this.client;
  }

  /**
   * @param { number } port
   */
  set applicationPort(port) {
    this.client = new undici.Client(`http://localhost:${port}`);
  }

  /**
   * Start server
   *
   * @param { { cert: Buffer, key: Buffer } } serverOptions
   * @returns { Promise<void> }
   */
  start(serverOptions) {
    return new Promise((resolve, reject) => {
      this.server = http2.createSecureServer({ allowHTTP1: true, ...serverOptions }, async (req, res) => {
        if (this.isReloadRequest(req)) {
          if (this.reload) {
            super.registerClient(req, res);
          } else {
            res.writeHead(404);
            res.end();
          }
          return;
        }

        const headers = { ...req.headers };
        headers.host = req.headers[':authority'];
        // Remove ilegal headers
        delete headers.connection;
        delete headers['keep-alive'];
        delete headers['transfer-encoding'];

        /** @type { import('undici').Dispatcher.RequestOptions } */ // @ts-ignore
        const options = {
          headers,
          method: req.method || 'GET',
          opaque: res,
          path: req.url || '/',
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          options.body = req;
        }

        try {
          this.client.stream(options, ({ statusCode, headers, opaque }) => {
            delete headers.connection;
            delete headers['keep-alive'];
            delete headers['transfer-encoding'];
            res.writeHead(statusCode || 200, headers);

            return /** @type { import('stream').Writable } */ (opaque);
          });
        } catch (err) {
          error(err);
          res.writeHead(500);
          res.end(err.message);
        }
      });

      decorateWithServerDestroy(this.server);
      this.server.setTimeout(0);
      this.server.unref();
      this.server.on('error', reject);
      this.server.on('listening', resolve);

      this.server.listen(443);
    });
  }

  /**
   * Destroy instance
   *
   * @returns { Promise<void> }
   */
  destroy() {
    return new Promise((resolve) => {
      super.destroy();

      this.client.destroy();

      if (!this.server) {
        return resolve();
      }

      this.server.removeAllListeners();
      // @ts-ignore
      this.server.destroy(resolve);
    });
  }
}

/**
 *
 *
 * @param { string | Array<string> } certsPaths
 * @returns { { cert: Buffer, key: Buffer } }
 */
function resolveCerts(certsPaths) {
  if (!Array.isArray(certsPaths)) {
    certsPaths = [certsPaths];
  }

  let cert;
  let key;

  for (const certsPath of certsPaths) {
    for (const filePath of getDirectoryContents(certsPath)) {
      const extname = path.extname(filePath);

      if (!cert && (extname === '.crt' || extname === '.cert') && !filePath.endsWith('.issuer.crt')) {
        cert = fs.readFileSync(filePath);
      } else if (!key && extname === '.key') {
        key = fs.readFileSync(filePath);
      }
    }
  }

  if (!cert || !key) {
    throw Error(`unable to find .crt or .key file after searching "${certsPaths.join(', ')}"`);
  }

  return { cert, key };
}

/**
 * Validate cert file data and return CommonName
 *
 * @param { Buffer} certFileData
 * @returns { string | undefined }
 */
function validateCert(certFileData) {
  try {
    const cert = Certificate.fromPEM(certFileData);
    const {
      subject: { commonName },
      validTo,
    } = cert;
    const now = new Date();
    const expires = new Date(validTo);
    const diff = expires.getTime() - now.getTime();

    if (diff < 0) {
      error('your ssl certificate has expired!');
    } else if (diff / 86400000 < 10) {
      warn('cetificate will expire soon!');
    }

    return commonName;
  } catch (err) {
    fatal(err);
  }
}
