import { connectClient, destroyClients, pushEvent } from '../push-events/index.js';
import config from '../config.js';
import Debug from 'debug';
import decorateWithServerDestroy from 'server-destroy';
import { EventSource } from '../reload/event-source.js';
import fs from 'fs';
import http from 'http';
import Metrics from '../utils/metrics.js';
import mime from 'mime';
import Mock from '../mock/index.js';
import path from 'path';
import WebSocket from 'faye-websocket';

const debug = Debug('dvlp:test');

export class TestServer {
  /**
   * Constructor
   *
   * @param { TestServerOptions } options
   */
  constructor(options) {
    const { autorespond = false, latency = config.latency, port = config.defaultPort, webroot = '' } = options;

    this._autorespond = autorespond;
    this._server;
    this.latency = latency;
    this.webroot = webroot;
    // Make sure mocks instance has access to active port
    this.port = config.activePort = port;
    this.mocks = new Mock();
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
          const url = /** @type { string } */ (req.url);

          connectClient(
            {
              url,
              type: 'ws',
            },
            req,
            socket,
            body,
          );

          this.pushEvent(new URL(url, `ws://${req.headers.host}`).href, 'connect');
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
