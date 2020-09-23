'use strict';

const { Certificate } = require('@fidm/x509');
const config = require('../config.js');
const decorateWithServerDestroy = require('server-destroy');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { isReloadRequest } = require('../reloader/index.js');
const os = require('os');
const path = require('path');

/**
 * Create reload server
 *
 * @param { string } certsPath
 * @returns { Promise<SecureProxy> }
 */
module.exports = async function secureProxy(certsPath) {
  const serverOptions = resolveCerts(certsPath);
  const commonName = validateCert(serverOptions.cert);
  const server = new SecureProxyServer();

  await server.start(serverOptions);

  return {
    commonName,
    destroy: server.destroy.bind(server),
  };
};

class SecureProxyServer {
  constructor() {
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
        const port = isReloadRequest(req)
          ? config.reloadPort
          : config.applicationPort;

        const originOptions = {
          port,
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
 * @param { string } certsPath
 * @returns { { cert: Buffer, key: Buffer } }
 */
function resolveCerts(certsPath) {
  if (certsPath.startsWith('~')) {
    certsPath = path.join(os.homedir(), certsPath.slice(1));
  }

  const dir = path.resolve(certsPath);

  if (!fs.existsSync(dir)) {
    throw Error(
      `unable to find directory path from --ssl option: ${certsPath}`,
    );
  }

  let cert;
  let key;

  for (const filePath of fs.readdirSync(dir)) {
    const extname = path.extname(filePath);
    const resolvedFilePath = path.join(dir, filePath);

    if (
      (extname === '.crt' || extname === '.cert') &&
      !filePath.endsWith('.issuer.crt')
    ) {
      cert = fs.readFileSync(resolvedFilePath);
    } else if (extname === '.key') {
      key = fs.readFileSync(resolvedFilePath);
    }
  }

  if (!cert || !key) {
    throw Error(`unable to find .crt or .key file in "${dir}"`);
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
