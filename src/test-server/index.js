'use strict';

const {
  connectClient,
  destroyClients,
  pushEvent,
} = require('../push-events/index.js');
const config = require('../config.js');
const debug = require('debug')('dvlp:test');
const decorateWithServerDestroy = require('server-destroy');
const fs = require('fs');
const http = require('http');
const { interceptClientRequest } = require('../utils/intercept.js');
const { isLocalhost } = require('../utils/is.js');
const Metrics = require('../utils/metrics.js');
const mime = require('mime');
const Mock = require('../mock/index.js');
const path = require('path');
const { URL } = require('url');
const WebSocket = require('faye-websocket');

const { EventSource } = WebSocket;
/** @type { Set<TestServer> } */
const instances = new Set();
let reroute = false;
let networkDisabled = false;
/** @type { () => void } */
let uninterceptClientRequest;

/**
 * Create test server
 *
 * @param { TestServerOptions } [options]
 * @returns { Promise<TestServer> }
 */
module.exports = async function testServerFactory(options) {
  enableRequestIntercept();

  const server = new TestServer(options || {});

  // @ts-ignore: private
  await server._start();
  // Make sure 'mock' has access to current active port
  config.applicationPort = server.port;
  // Force testing mode to suppress logging
  config.testing = true;

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
  rerouteAllRequests = false,
) {
  enableRequestIntercept();
  networkDisabled = true;
  reroute = rerouteAllRequests;
};

/**
 * Re-enable all external network connections
 *
 * @returns { void }
 */
module.exports.enableNetwork = function enableNetwork() {
  enableRequestIntercept();
  networkDisabled = false;
  reroute = false;
};

/**
 * Default mock response handler for network hang
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { undefined }
 */
module.exports.mockHangResponseHandler = function mockHangResponseHandler(
  req,
  res,
) {
  return;
};

/**
 * Default mock response handler for 500 response
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { undefined }
 */
module.exports.mockErrorResponseHandler = function mockErrorResponseHandler(
  req,
  res,
) {
  res.writeHead(500);
  res.error = Error('error');
  res.end('error');
  return;
};

/**
 * Default mock response handler for 404 response
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { undefined }
 */
module.exports.mockMissingResponseHandler = function mockMissingResponseHandler(
  req,
  res,
) {
  res.writeHead(404);
  res.end('missing');
  return;
};

/**
 * Default mock response handler for offline
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { undefined }
 */
module.exports.mockOfflineResponseHandler = function mockOfflineResponseHandler(
  req,
  res,
) {
  req.socket.destroy();
  return;
};

class TestServer {
  /**
   * Constructor
   *
   * @param { TestServerOptions } options
   */
  constructor(options) {
    const {
      autorespond = true,
      latency = config.latency,
      port = config.port,
      webroot = '',
    } = options;

    this.latency = latency;
    this.mocks = new Mock();
    this.webroot = webroot;
    this._autorespond = autorespond;
    this.port = port;
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
        // @ts-ignore
        res.metrics = new Metrics(res);

        // @ts-ignore
        if (EventSource.isEventSource(req)) {
          connectClient(
            {
              // @ts-ignore
              url: req.url,
              type: 'es',
            },
            req,
            res,
          );
          // @ts-ignore
          this.pushEvent(req.url, 'connect');
          return;
        }

        // @ts-ignore
        const url = new URL(req.url, `http://localhost:${this.port}`);
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
          // @ts-ignore
        } else if (req.aborted) {
          debug(`not ok: ${req.url} aborted`);
          return;
        } else if (mock) {
          debug(`ok: ${req.url} responding with mocked data`);
          // @ts-ignore
          this.mocks.matchResponse(mock, req, res);
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

        // @ts-ignore
        res.writeHead(200, {
          'Content-Length': size,
          'Cache-Control': `public, max-age=${maxage}`,
          'Content-Type': type,
          ...headers,
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
              type: 'ws',
            },
            req,
            socket,
            body,
          );

          this.pushEvent(
            new URL(req.url, `ws://${req.headers.host}`).href,
            'connect',
          );
        }
      });

      this._server.listen(this.port);
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
   * @param { MockResponse | MockResponseHandler } response
   * @param { boolean } [once]
   * @param { () => void } [onMockCallback]
   * @returns { () => void } remove mock
   */
  mockResponse(request, response, once = false, onMockCallback) {
    return this.mocks.addResponse(request, response, once, onMockCallback);
  }

  /**
   * Register mock push 'events' for 'stream'
   *
   * @param { string | MockPushStream } stream
   * @param { MockPushEvent | Array<MockPushEvent> } events
   * @returns { () => void } remove mock
   */
  mockPushEvents(stream, events) {
    return this.mocks.addPushEvents(stream, events);
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
      // @ts-ignore
      pushEvent(stream, event);
    }
  }

  /**
   * Clear all mock data
   */
  clearMockFiles() {
    this.mocks.clear();
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
      // @ts-ignore
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
    this.mocks.clear();
    instances.delete(this);
    return this._stop();
  }
}

/**
 * Enable request interception to allow mocking/network disabling
 */
function enableRequestIntercept() {
  if (uninterceptClientRequest === undefined) {
    uninterceptClientRequest = interceptClientRequest((url) => {
      const isMocked = Array.from(instances).some((instance) => {
        return instance.mocks.hasMatch(url);
      });
      let hostname = url.hostname || url.host;

      // Allow mocked requests to pass-through
      if (!isMocked && !isLocalhost(hostname)) {
        if (reroute) {
          // Reroute back to this server
          url.host = url.hostname = `localhost:${config.applicationPort}`;
        } else if (networkDisabled) {
          throw Error(`network connections disabled. Unable to request ${url}`);
        }
      }

      return true;
    });
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
