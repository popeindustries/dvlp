'use strict';

const { URL } = require('url');
const debug = require('debug')('dvlp');
const decorateWithServerDestroy = require('server-destroy');
const fs = require('fs');
const http = require('http');
const mime = require('mime');
const path = require('path');

const DEFAULT_PORT = 8080;
const DEFAULT_LATENCY = 50;

const originalRequest = http.request;

/**
 * Create test server
 * @param {{ port: number, latency: number, webroot: string }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function testServer({
  latency = DEFAULT_LATENCY,
  port = DEFAULT_PORT,
  webroot = ''
} = {}) {
  const instance = new TestServer(latency, port, webroot);

  await instance._start();

  return instance;
};

module.exports.disableNetwork = disableNetwork;
module.exports.enableNetwork = enableNetwork;

/**
 * Disable all external network connections
 */
function disableNetwork() {
  http.request = new Proxy(http.request, {
    apply(target, ctx, args) {
      let options = args[0];

      if (typeof options === 'string') {
        options = new URL(options);
      }

      if (options.hostname !== 'localhost') {
        throw Error('network connections disabled');
      }

      return Reflect.apply(target, ctx, args);
    }
  });
}

/**
 * Enable all external network connections
 */
function enableNetwork() {
  http.request = originalRequest;
}

class TestServer {
  constructor(latency, port, webroot) {
    this.latency = latency;
    this.webroot = webroot;
    this._mocks = new Map();
    this._port = port;
    this._server = null;
  }

  /**
   * Start server
   * @returns {Promise<void>}
   */
  _start() {
    return new Promise((resolve, reject) => {
      this._server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const error = url.searchParams.get('error') != null;
        const maxage = url.searchParams.get('maxage') || 0;
        const missing = url.searchParams.get('missing') != null;
        const offline = url.searchParams.get('offline') != null;

        await sleep(this.latency);

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

        const trimmedPath = url.pathname.slice(1);
        const mocked = this._mocks.get(trimmedPath);
        let type = mime.getType(trimmedPath);
        // TODO: handle encoded query strings in path name
        let filepath = path.resolve(path.join(this.webroot, trimmedPath));
        let body = '';
        let size = 0;
        let stat;
        let msg = '';

        if (mocked != null) {
          // TODO: add support for header mocking
          const isString = typeof mocked.body === 'string';

          body = isString ? mocked.body : JSON.stringify(mocked.body);
          type = isString ? 'text/html' : 'application/json';
          size = Buffer.byteLength(body);
          msg = `ok: ${req.url} responding with mocked data`;
          // TODO: add support for permanent mocking?
          this._mocks.delete(trimmedPath);
        } else {
          // Ignore webroot if no file
          if (!fs.existsSync(filepath)) {
            filepath = path.resolve(trimmedPath);
          }

          try {
            stat = fs.statSync(filepath);
            size = stat.size;
            msg = `ok: ${req.url} responding with file`;
          } catch (err) {
            body = '"hello"';
            size = Buffer.byteLength(body);
            msg = `ok: ${req.url} responding with dummy file`;
          }
        }

        res.writeHead(200, {
          'Content-Length': size,
          'Cache-Control': `public, max-age=${maxage}`,
          'Content-Type': type
        });

        debug(msg);

        return body ? res.end(body) : fs.createReadStream(filepath).pipe(res);
      });

      decorateWithServerDestroy(this._server);

      this._server.on('error', reject);
      this._server.on('listening', resolve);

      this._server.listen(this._port);
    });
  }

  /**
   * Register mock 'response' for 'url' request
   * @param {string} url
   * @param {object} response
   */
  mock(url, response) {
    if (url.charAt(0) === '/') {
      url = url.slice(1);
    }
    if (!response.body) {
      response = { body: response };
    }
    this._mocks.set(url, response);
  }

  /**
   * Stop running server
   * @returns {Promise<void>}
   */
  _stop() {
    return new Promise((resolve) => {
      if (!this._server) {
        return resolve();
      }

      this._server.removeAllListeners();
      this._server.destroy(() => {
        debug('server stopped');
        resolve();
      });
    });
  }

  /**
   * Destroy instance
   * @returns {Promise<void>}
   */
  destroy() {
    debug('destroying');
    this._mocks.clear();
    return this._stop();
  }
}

/**
 * Sleep for random number of milliseconds between 'min' and '2xmin'
 * @param {number} min
 * @returns {Promise<void>}
 */
function sleep(min) {
  return new Promise((resolve) => {
    if (!min) {
      return resolve();
    }
    setTimeout(resolve, min + Math.random() * min);
  });
}
