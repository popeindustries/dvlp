'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 * @typedef { import("http").ServerResponse } ServerResponse
 * @typedef { import("../mock/index.js").MockPushEvent } MockPushEvent
 * @typedef { import("../mock/index.js").MockPushStream } MockPushStream
 * @typedef { import("../mock/index.js").MockRequest } MockRequest
 * @typedef { import("../mock/index.js").MockResponse } MockResponse
 * @typedef { import("../push-events/index.js").PushEvent } PushEvent
 * @typedef { import("../push-events/index.js").PushStream } PushStream
 */
/**
 * @typedef { object } testServerOptions
 * @property { boolean } [autorespond] - automatically respond with dummy response when no matching file/mock found
 * @property { number } [latency] - minimum amount of random artificial latency to introduce (in `ms`) for responses
 * @property { number } [port] - port number
 * @property { string } [webroot] - the subpath from `process.cwd()` to prepend to relative paths
 */

const {
  connectClient,
  destroyClients,
  pushEvent
} = require('../push-events/index.js');
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
  latency = config.latency,
  port = config.port,
  webroot = ''
} = {}) {
  const server = new TestServer({
    autorespond,
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
    const { autorespond, latency, port, webroot } = options;

    this.latency = latency;
    this.mocks = new Mock();
    this.webroot = webroot;
    this._autorespond = autorespond;
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
          connectClient(
            {
              url: req.url,
              type: 'es'
            },
            req,
            res
          );
          return;
        }

        const url = new URL(req.url, `http://localhost:${this._port}`);
        const error = url.searchParams.get('error') != null;
        const hang = url.searchParams.get('hang') != null;
        const maxage = url.searchParams.get('maxage') || 0;
        const missing = url.searchParams.get('missing') != null;
        const offline = url.searchParams.get('offline') != null;
        const mock = url.searchParams.get('dvlpmock');

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
        } else if (mock) {
          debug(`ok: ${req.url} responding with mocked data`);
          this.mocks.matchResponse(mock, res);
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
      this._server.on('upgrade', (req, socket, body) => {
        if (WebSocket.isWebSocket(req)) {
          connectClient(
            {
              url: req.url,
              type: 'ws'
            },
            req,
            socket,
            body
          );
        }
      });

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
   * @param { string | MockRequest } request
   * @param { MockResponse } response
   * @param { boolean } [once]
   */
  mockResponse(request, response, once = false) {
    this.mocks.addResponse(request, response, once);
  }

  /**
   * Register mock push 'events' for 'stream'
   *
   * @param { string | MockPushStream } stream
   * @param { MockPushEvent | Array<MockPushEvent> } events
   */
  mockPushEvents(stream, events) {
    this.mocks.addPushEvents(stream, events);
  }

  /**
   * Push data to WebSocket/EventSource clients
   * A string passed as 'event' will be handled as a named mock push event
   *
   * @param { string | PushStream } stream
   * @param { string | PushEvent } [event]
   * @returns { void }
   */
  pushEvent(stream, event) {
    // Passed a mocked event name
    if (typeof event === 'string') {
      this.mocks.matchPushEvent(stream, event, pushEvent);
    } else {
      pushEvent(stream, event);
    }
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
    destroyClients();
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
