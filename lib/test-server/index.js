'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 * @typedef { import("http").ServerResponse } ServerResponse
 */
/**
 * @typedef { object } testServerOptions
 * @property { boolean } [autorespond] - automatically respond with dummy response when no matching file/mock found
 * @property { boolean } [enableEventSource] - enable EventSource push capability
 * @property { boolean } [enableWebSocket] - enable WebSocket push capability
 * @property { number } [latency] - minimum amount of random artificial latency to introduce (in `ms`) for responses
 * @property { number } [port] - port number
 * @property { string } [webroot] - the subpath from `process.cwd()` to prepend to relative paths
 */

const { destroyPushClients, initPushClient, push } = require('../mock/push.js');
const config = require('../config.js');
const debug = require('debug')('dvlp:test');
const decorateWithServerDestroy = require('server-destroy');
const fs = require('fs');
const http = require('http');
const { interceptClientRequest } = require('../utils/intercept.js');
const { isLocalhost } = require('../utils/is.js');
const mime = require('mime');
const Mock = require('../mock/index.js');
const path = require('path');
const { URL } = require('url');
const WebSocket = require('faye-websocket');

const { EventSource } = WebSocket;
const instances = new Set();
let reroute = false;
let networkDisabled = false;

interceptClientRequest((url) => {
  const isMocked = Array.from(instances).some((instance) =>
    instance.mocks.hasMatch(url)
  );
  let hostname = url.hostname || url.host;

  // Allow mocked requests to pass-through
  if (!isMocked && !isLocalhost(hostname)) {
    if (reroute) {
      // Reroute back to this server
      url.host = url.hostname = `localhost:${config.activePort}`;
    } else if (networkDisabled) {
      throw Error(`network connections disabled. Unable to request ${url}`);
    }
  }

  return url;
});

/**
 * Create test server
 *
 * @param { testServerOptions } [options]
 * @returns { TestServer }
 */
module.exports = async function testServer({
  autorespond = true,
  enableEventSource = false,
  enableWebSocket = false,
  latency = config.latency,
  port = config.port,
  webroot = ''
} = {}) {
  const server = new TestServer({
    autorespond,
    enableEventSource,
    enableWebSocket,
    latency,
    port,
    webroot
  });

  await server._start();
  // Make sure 'mock' has access to current active port
  config.activePort = port;

  instances.add(server);

  return server;
};

/**
 * Disable all external network connections
 * and optionally reroute all external requests to this server
 *
 * @param { boolean } [rerouteAllRequests]
 * @returns { void }
 */
module.exports.disableNetwork = function disableNetwork(
  rerouteAllRequests = false
) {
  networkDisabled = true;
  reroute = rerouteAllRequests;
};

/**
 * Enable all external network connections
 *
 * @returns { void }
 */
module.exports.enableNetwork = function enableNetwork() {
  networkDisabled = true;
  reroute = false;
};

class TestServer {
  /**
   * Constructor
   *
   * @param { testServerOptions } options
   */
  constructor(options) {
    const {
      autorespond,
      enableEventSource,
      enableWebSocket,
      latency,
      port,
      webroot
    } = options;

    this.latency = latency;
    this.mocks = new Mock();
    this.webroot = webroot;
    this._autorespond = autorespond;
    this._pushClients = new Set();
    this._enableEventSource = enableEventSource;
    this._enableWebSocket = enableWebSocket;
    this._port = port;
    this._server = null;
  }

  /**
   * Start server
   *
   * @returns { Promise<void> }
   * @private
   */
  _start() {
    return new Promise((resolve, reject) => {
      this._server = http.createServer(async (req, res) => {
        if (EventSource.isEventSource(req)) {
          if (!this._enableEventSource) {
            res.writeHead(404);
            res.end();
          } else {
            initPushClient(this._pushClients, 'es', req, res);
          }
          return;
        }

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

        this.latency && (await sleep(this.latency));

        if (error || missing) {
          const statusCode = error ? 500 : 404;
          const body = error ? 'error' : 'missing';

          debug(`not ok: ${req.url} responding with ${statusCode}`);
          res.statusCode = statusCode;
          res.end(body);
          return;
        } else if (offline) {
          debug(`not ok: ${req.url} offline`);
          req.socket.destroy();
          return;
        } else if (req.aborted) {
          debug(`not ok: ${req.url} aborted`);
          return;
        } else if (mocked) {
          debug(`ok: ${req.url} responding with mocked data`);
          this.mocks.match(mocked, res);
          return;
        }

        const trimmedPath = url.pathname.slice(1);
        let type = mime.getType(trimmedPath);
        // TODO: handle encoded query strings in path name?
        let filePath = path.resolve(path.join(this.webroot, trimmedPath));
        let body = '';
        let headers = {};
        let size = 0;
        let stat;
        let msg = '';

        // Ignore webroot if no file
        if (!fs.existsSync(filePath)) {
          filePath = path.resolve(trimmedPath);
        }

        try {
          stat = fs.statSync(filePath);
          size = stat.size;
          msg = `ok: ${req.url} responding with file`;
        } catch (err) {
          if (!this._autorespond) {
            res.writeHead(404);
            return res.end();
          }
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

        return body ? res.end(body) : fs.createReadStream(filePath).pipe(res);
      });

      decorateWithServerDestroy(this._server);
      this._server.unref();
      this._server.on('error', reject);
      this._server.on('listening', resolve);
      if (this._enableWebSocket) {
        this._server.on('upgrade', (req, socket, body) => {
          if (WebSocket.isWebSocket(req)) {
            initPushClient(this._pushClients, 'ws', req, socket, body);
          }
        });
      }

      this._server.listen(this._port);
    });
  }

  /**
   * Load mock files at 'filePath'
   *
   * @param { string | Array<string> } filePath
   */
  loadMockFiles(filePath) {
    this.mocks.load(filePath);
  }

  /**
   * Register mock 'response' for 'request'
   *
   * @param { string | object } request
   * @param { object } response
   * @param { boolean } [once]
   */
  mock(request, response, once = false) {
    this.mocks.add(request, response, once);
  }

  /**
   * Push data to WebSocket/EventSource clients
   *
   * @param { string | Buffer } message
   * @param { object } [options] - EventSource options
   * @param { string } [options.event] - event name
   * @param { string } [options.id] - event id
   * @returns { void }
   */
  push(message, options) {
    push(this._pushClients, message, options);
  }

  /**
   * Stop running server
   *
   * @returns { Promise<void> }
   * @private
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
   *
   * @returns { Promise<void> }
   */
  destroy() {
    debug('destroying');
    destroyPushClients(this._pushClients);
    this.mocks.clean();
    instances.delete(this);
    return this._stop();
  }
}

/**
 * Sleep for random number of milliseconds between 'min' and '2xmin'
 *
 * @param { number } min
 * @returns { Promise<void> }
 * @private
 */
function sleep(min) {
  return new Promise((resolve) => {
    if (!min) {
      return resolve();
    }
    setTimeout(resolve, min + Math.random() * min);
  });
}
