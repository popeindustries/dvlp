'use strict';

const debug = require('debug')('dvlp');
const decorateWithServerDestroy = require('server-destroy');
const fs = require('fs');
const http = require('http');
const { interceptClientRequest } = require('./utils/intercept');
const mime = require('mime');
const mock = require('./utils/mock');
const path = require('path');
const { URL } = require('url');

const DEFAULT_PORT = 8080;
const DEFAULT_LATENCY = 50;

let activePort = null;
let activeListeners = 0;
let mocking = false;
let networkDisabled = false;
let unlistenForClientRequests = () => {};

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
 * Proxy all http requests
 */
function listenForClientRequests() {
  unlistenForClientRequests = interceptClientRequest((url) => {
    const mocked = mock.match(url.href);

    if (mocked) {
      url.searchParams.append('mock', url.href);
      url.host = `localhost:${activePort}`;
    }

    const hostname = url.hostname || url.host;

    if (networkDisabled && !hostname.includes('localhost')) {
      throw Error('network connections disabled');
    }

    return url;
  });
}

/**
 * Disable all external network connections
 */
function disableNetwork() {
  networkDisabled = true;
  activeListeners++;
  listenForClientRequests();
}

/**
 * Enable all external network connections
 */
function enableNetwork() {
  networkDisabled = false;
  if (!--activeListeners) {
    unlistenForClientRequests();
  }
}

class TestServer {
  constructor(latency, port, webroot) {
    this.latency = latency;
    this.webroot = webroot;
    this._singleShotMocks = new Map();
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
        const mockedUrl = url.searchParams.get('mock');

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
          debug(`not ok: ${req.url} offline`);
          return;
        }

        if (req.aborted) {
          debug(`not ok: ${req.url} aborted`);
          return;
        }

        if (mockedUrl) {
          mock.match(mockedUrl, res);
          debug(`ok: ${req.url} responding with mocked data`);
          return;
        }

        const trimmedPath = url.pathname.slice(1);
        const mocked = this._singleShotMocks.get(`${trimmedPath}${url.search}`);
        let type = mime.getType(trimmedPath);
        // TODO: handle encoded query strings in path name
        let filepath = path.resolve(path.join(this.webroot, trimmedPath));
        let body = '';
        let headers = {};
        let size = 0;
        let stat;
        let msg = '';

        if (mocked !== undefined) {
          const isString = typeof mocked.body === 'string';

          body = isString ? mocked.body : JSON.stringify(mocked.body);
          headers = mocked.headers || {};
          type = isString ? 'text/html' : 'application/json';
          size = Buffer.byteLength(body);
          msg = `ok: ${req.url} responding with mocked data`;
          this._singleShotMocks.delete(trimmedPath);
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
   * @param {string|[string]} filepath
   */
  mock(filepath) {
    activeListeners++;
    // Request proxying is global, so store current port
    activePort = this._port;
    mocking = true;
    listenForClientRequests();
    mock.load(filepath);
  }

  /**
   * Register onetime mock 'response' for 'url' request
   * @param {string} url
   * @param {object} response
   */
  mockOnce(url, response) {
    if (url.charAt(0) === '/') {
      url = url.slice(1);
    }
    if (!response.body) {
      response = { body: response, headers: {} };
    }
    this._singleShotMocks.set(url, response);
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
    this._singleShotMocks.clear();
    if (mocking) {
      mock.cleanMocks();
      if (!--activeListeners) {
        unlistenForClientRequests();
      }
    }
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
