'use strict';

const config = require('./config');
const debug = require('debug')('dvlp');
const decorateWithServerDestroy = require('server-destroy');
const fs = require('fs');
const http = require('http');
const { interceptClientRequest } = require('./utils/intercept');
const mime = require('mime');
const mock = require('./utils/mock');
const path = require('path');
const { URL } = require('url');

let unlistenForClientRequests = () => {};

/**
 * Create test server
 * @param {{ port: number, latency: number, webroot: string }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function testServer({
  latency = config.latency,
  port = config.port,
  webroot = ''
} = {}) {
  const instance = new TestServer(latency, port, webroot);

  await instance._start();
  // Make sure 'mock' has access to current port
  config.activePort = port;

  return instance;
};

/**
 * Disable all external network connections
 */
module.exports.disableNetwork = listenForClientRequests;

/**
 * Enable all external network connections
 */
module.exports.enableNetwork = unlistenForClientRequests;

/**
 * Listen for all http requests
 */
function listenForClientRequests() {
  unlistenForClientRequests = interceptClientRequest((url) => {
    const hostname = url.hostname || url.host;

    if (!hostname.includes('localhost')) {
      throw Error('network connections disabled');
    }

    return url;
  });
}

class TestServer {
  constructor(latency, port, webroot) {
    this.latency = latency;
    this.webroot = webroot;
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
        const url = new URL(req.url, `http://localhost:${this._port}`);
        const error = url.searchParams.get('error') != null;
        const hang = url.searchParams.get('hang') != null;
        const maxage = url.searchParams.get('maxage') || 0;
        const missing = url.searchParams.get('missing') != null;
        const offline = url.searchParams.get('offline') != null;
        const mocked = url.searchParams.get('mock');

        if (hang) {
          return;
        }

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
          debug(`not ok: ${req.url} offline`);
          req.socket.destroy();
          return;
        }

        if (req.aborted) {
          debug(`not ok: ${req.url} aborted`);
          return;
        }

        if (mocked) {
          debug(`ok: ${req.url} responding with mocked data`);
          mock.match(mocked, res);
          return;
        }

        const trimmedPath = url.pathname.slice(1);
        let type = mime.getType(trimmedPath);
        // TODO: handle encoded query strings in path name?
        let filepath = path.resolve(path.join(this.webroot, trimmedPath));
        let body = '';
        let headers = {};
        let size = 0;
        let stat;
        let msg = '';

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

        res.writeHead(200, {
          'Content-Length': size,
          'Cache-Control': `public, max-age=${maxage}`,
          'Content-Type': type,
          ...headers
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
   * Load mock files at 'filepath'
   * If 'overrideHost' is set, all remote request urls will be overwritten to http://localhost:{port}
   * @param {string|[string]} filepath
   * @param {boolean} overrideHost
   */
  loadMockFiles(filepath, overrideHost) {
    mock.load(filepath, overrideHost && `http://localhost:${this._port}`);
  }

  /**
   * Register mock 'response' for 'request'
   * @param {string|object} request
   * @param {object} response
   * @param {boolean} [once]
   */
  mock(request, response, once = false) {
    mock.add(request, response, once);
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
