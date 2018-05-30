'use strict';

const { URL } = require('url');
const debug = require('debug')('dvlp');
const fs = require('fs');
const http = require('http');
const mime = require('mime');
const path = require('path');

const DEFAULT_PORT = 8080;
const DEFAULT_LATENCY = 50;

/**
 * Create test server
 * @param {{ port: number, latency: number, webroot: string }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = function testServer({
  latency = DEFAULT_LATENCY,
  port = DEFAULT_PORT,
  webroot = ''
} = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const error = url.searchParams.get('error') != null;
      const maxage = url.searchParams.get('maxage') || DEFAULT_LATENCY;
      const missing = url.searchParams.get('missing') != null;
      const offline = url.searchParams.get('offline') != null;

      await sleep(server.latency);

      if (error || missing) {
        const statusCode = error ? 500 : 404;
        const body = error ? 'error' : 'missing';

        debug(`not ok: ${req.url} responding with ${statusCode}`);
        res.statusCode = statusCode;
        res.end(body);
        return;
      }

      if (offline) {
        req.socket.destroy();
        return;
      }

      if (url.pathname === '/config') {
        let statusCode = 200;

        if (req.method !== 'POST') {
          statusCode = 405;
        } else {
          init(server, latency, webroot);
        }

        res.statusCode = statusCode;
        res.end();
        return;
      }

      const type = mime.getType(url.pathname);
      const trimmedPath = url.pathname.slice(1);
      let isDummy = false;
      let filepath = path.resolve(path.join(server.webroot, trimmedPath));
      let body = '';
      let size = 0;
      let stat;

      if (!fs.existsSync(filepath)) {
        filepath = path.resolve(trimmedPath);
      }

      try {
        stat = fs.statSync(filepath);
        size = stat.size;
      } catch (err) {
        isDummy = true;
        body = '"hello"';
        size = Buffer.byteLength(body);
      }

      res.writeHead(200, {
        'Content-Length': size,
        'Cache-Control': `public, max-age=${maxage}`,
        'Content-Type': type
      });

      debug(
        isDummy
          ? `ok: ${req.url} responding with dummy file`
          : `ok: ${req.url} responding with file`
      );

      return body ? res.end(body) : fs.createReadStream(filepath).pipe(res);
    });

    server.on('error', reject);
    server.on('listening', () => resolve(server));
    server.destroy = function destroy() {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          server.removeAllListeners();
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    };

    init(server, latency, webroot);

    server.listen(port);
  });
};

function init(server, latency = DEFAULT_LATENCY, webroot = process.cwd()) {
  server.latency = latency;
  server.webroot = webroot;

  debug(`init with latency: ${latency}, webroot: ${webroot}`);
}

function sleep(min) {
  return new Promise((resolve) => {
    if (!min) {
      return resolve();
    }
    setTimeout(resolve, min + Math.random() * min);
  });
}
