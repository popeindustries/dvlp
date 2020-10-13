'use strict';

const { Certificate } = require('@fidm/x509');
const config = require('../config.js');
const decorateWithServerDestroy = require('server-destroy');
const EventSourceServer = require('../reloader/event-source-server.js');
const fs = require('fs');
const { getDirectoryContents } = require('../utils/file');
const { getReloadClientEmbed } = require('../reloader/reload-client-embed.js');
const http = require('http');
const https = require('https');
const path = require('path');

/**
 * Create secure proxy server.
 * Implements Reloader behaviour to handle registering reload clients if "reload=true".
 *
 * @param { string | Array<string> } certsPath
 * @param { boolean } reload
 * @returns { Promise<SecureProxy> }
 */
module.exports = async function secureProxy(certsPath, reload) {
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
  };
};

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
  }

  /**
   * Start server
   *
   * @param { { cert: Buffer, key: Buffer } } serverOptions
   * @returns { Promise<void> }
   */
  start(serverOptions) {
    return new Promise((resolve, reject) => {
      /** @type { DestroyableHttpsServer } */
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

        const originOptions = {
          port: config.applicationPort,
          path: req.url,
          method: req.method,
          headers: req.headers,
        };

        const originRequest = http.request(originOptions, (originResponse) => {
          const { statusCode } = originResponse;
          res.writeHead(statusCode || 200, originResponse.headers);
          originResponse.pipe(res);
        });

        req.pipe(originRequest);
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

      if (
        !cert &&
        (extname === '.crt' || extname === '.cert') &&
        !filePath.endsWith('.issuer.crt')
      ) {
        cert = fs.readFileSync(filePath);
      } else if (!key && extname === '.key') {
        key = fs.readFileSync(filePath);
      }
    }
  }

  if (!cert || !key) {
    throw Error(
      `unable to find .crt or .key file after searching "${certsPaths.join(
        ', ',
      )}"`,
    );
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
      throw Error('your ssl certificate has expired!');
    } else if (diff / 86400000 < 10) {
      // TODO warn
    }

    return commonName;
  } catch (err) {
    // TODO: log error
  }
}
