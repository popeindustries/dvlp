import { error, fatal, warn } from '../utils/log.js';
import { Certificate } from '@fidm/x509';
import config from '../config.js';
import decorateWithServerDestroy from 'server-destroy';
import EventSourceServer from '../reloader/event-source-server.js';
import fs from 'fs';
import { getDirectoryContents } from '../utils/file.js';
import { getReloadClientEmbed } from '../reloader/reload-client-embed.js';
import https from 'https';
import path from 'path';
import undici from 'undici';

/**
 * Create secure proxy server.
 * Implements Reloader behaviour to handle registering reload clients if "reload=true".
 *
 * @param { string | Array<string> } certsPath
 * @param { boolean } reload
 * @param { number } port
 * @returns { Promise<SecureProxy> }
 */
export default async function secureProxy(certsPath, reload, port) {
  const serverOptions = resolveCerts(certsPath);
  const commonName = validateCert(serverOptions.cert);
  const server = new SecureProxyServer(reload, port);

  await server.start(serverOptions);

  return {
    commonName,
    destroy: server.destroy.bind(server),
    reloadEmbed: getReloadClientEmbed(443),
    reloadPort: 443,
    reloadUrl: `https://localhost:${443}${config.reloadEndpoint}`,
    send: server.send.bind(server),
  };
}

class SecureProxyServer extends EventSourceServer {
  /**
   * Constructor
   *
   * @param { boolean } reload
   * @param { number } port
   */
  constructor(reload, port) {
    super();
    this.reload = reload;
    this.server;
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
      this.server = https.createServer(serverOptions, async (req, res) => {
        // @ts-ignore
        if (this.isReloadRequest(req)) {
          if (this.reload) {
            super.registerClient(req, res);
          } else {
            res.writeHead(404);
            res.end();
          }
          return;
        }

        // Remove ilegal headers
        const headers = { ...req.headers };
        headers.connection = undefined;
        headers['transfer-encoding'] = undefined;

        this.client.stream(
          {
            headers,
            // @ts-ignore
            maxRedirections: 10,
            method: req.method || 'GET',
            path: req.url || '/',
            opaque: res,
          },
          ({ statusCode, headers, opaque }) => {
            res.writeHead(statusCode || 200, headers);
            return opaque;
          },
        );
      });

      decorateWithServerDestroy(this.server);
      this.server.timeout = this.server.keepAliveTimeout = 0;
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
