import {
  connectClient,
  destroyClients,
  pushEvent,
} from '../push-events/index.js';
import config from '../config.js';
import Debug from 'debug';
import { EventSource } from '../reload/event-source.js';
import fs from 'node:fs';
import { getType } from '../utils/mime.js';
import http from 'node:http';
import { Metrics } from '../utils/metrics.js';
import { Mocks } from '../mock/index.js';
import path from 'node:path';
// @ts-expect-error - missing types
import WebSocket from 'faye-websocket';

const debug = Debug('dvlp:test');

export class TestServer {
  #autorespond;
  /** @type { Map<string, import('node:stream').Duplex> } */
  #connections = new Map();
  /** @type { HttpServer | undefined } */
  #server;
  /** @type { Record<string, (data: any) => void> } */
  #onSendCallbacks = {};

  /**
   * Constructor
   *
   * @param { TestServerOptions } options
   */
  constructor(options) {
    const {
      autorespond = false,
      latency = config.latency,
      port = config.defaultPort,
      webroot = '',
    } = options;

    this.latency = latency;
    this.webroot = webroot;
    // Make sure mocks instance has access to active port
    this.port = config.activePort = port;
    this.mocks = new Mocks();

    this.#autorespond = autorespond;
  }

  /**
   * Start server
   *
   * @returns { Promise<void> }
   * @private
   */
  _start() {
    return new Promise((resolve, reject) => {
      this.#server = http.createServer(async (req, res) => {
        // @ts-expect-error - exists
        res.url ??= req.url;
        // @ts-expect-error - exists
        res.metrics = new Metrics(res);

        if (EventSource.isEventSource(req)) {
          connectClient(
            {
              // @ts-expect-error - non-null
              url: req.url,
              type: 'es',
            },
            req,
            res,
          );
          // @ts-expect-error - non-null
          this.pushEvent(req.url, 'connect');
          return;
        }

        // @ts-expect-error - non-null
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const error = url.searchParams.get('error') != null;
        const hang = url.searchParams.get('hang') != null;
        const maxage = url.searchParams.get('maxage') || 0;
        const missing = url.searchParams.get('missing') != null;
        const offline = url.searchParams.get('offline') != null;
        const mock = url.searchParams.get('dvlpmock') ?? url.href;

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
        } else if (req.destroyed) {
          debug(`not ok: ${req.url} aborted`);
          return;
        } else if (mock) {
          debug(`ok: ${req.url} responding with mocked data`);
          // @ts-expect-error - type Req
          if (this.mocks.matchResponse(mock, req, res)) {
            return;
          }
        }

        const trimmedPath = url.pathname.slice(1);
        const type = getType(trimmedPath);
        /** @type { Record<string, string> } */
        const headers = {};
        // TODO: handle encoded query strings in path name?
        let filePath = path.resolve(path.join(this.webroot, trimmedPath));
        let body = '';
        let size = 0;
        let stat;
        let msg = '';

        // Copy custom headers to response
        for (const [key, value] of Object.entries(req.headers)) {
          if (key.startsWith('x-')) {
            // @ts-expect-error - is string
            headers[key] = value;
          }
        }

        // Ignore webroot if no file
        if (!fs.existsSync(filePath)) {
          filePath = path.resolve(trimmedPath);
        }

        try {
          stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            throw new Error('path is directory');
          }
          size = stat.size;
          msg = `ok: ${req.url} responding with file`;
        } catch {
          if (!this.#autorespond) {
            res.writeHead(404);
            return res.end();
          }
          body = `"hello from ${url.href}!"`;
          size = Buffer.byteLength(body);
          msg = `ok: ${req.url} responding with dummy file`;
        }

        res.writeHead(200, {
          'Content-Length': size,
          'Cache-Control': `public, max-age=${maxage}`,
          'Content-Type': type,
          ...headers,
        });

        debug(msg);

        return body ? res.end(body) : fs.createReadStream(filePath).pipe(res);
      });

      this.#server.unref();
      this.#server.on('error', reject);
      this.#server.on('listening', resolve);
      this.#server.on('connection', (connection) => {
        const key = `${connection.remoteAddress}:${connection.remotePort}`;

        this.#connections.set(key, connection);
        connection.once('close', () => {
          this.#connections.delete(key);
        });
      });
      this.#server.on('upgrade', (req, socket, body) => {
        if (WebSocket.isWebSocket(req)) {
          const url = new URL(
            /** @type { string } */ (req.url),
            `ws://${req.headers.host}`,
          );
          const callback = this.#onSendCallbacks[decodeURIComponent(url.href)];

          connectClient(
            {
              url: url.href,
              type: 'ws',
            },
            req,
            socket,
            body,
            callback,
          );

          this.pushEvent(url.href, 'connect');
        }
      });

      this.#server.listen(this.port);
    });
  }

  /**
   * Load mock files at 'filePath'
   *
   * @param { string | Array<string> } filePath
   */
  loadMockFiles(filePath) {
    return this.mocks.load(filePath);
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
   * @param { (data: any) => void } [onSendCallback] - WS client send callback
   * @returns { () => void } remove mock
   */
  mockPushEvents(stream, events, onSendCallback) {
    if (onSendCallback) {
      const key = typeof stream === 'string' ? stream : stream.url;
      this.#onSendCallbacks[key] = onSendCallback;
    }
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
      // @ts-expect-error - non-null
      pushEvent(stream, event);
    }
  }

  /**
   * Clear all mock data
   */
  clearMockFiles() {
    this.mocks.clear();
  }

  ref() {
    this.#server?.ref();
  }

  unref() {
    this.#server?.unref();
  }

  /**
   * Stop running server
   *
   * @returns { Promise<void> }
   * @private
   */
  _stop() {
    return new Promise((resolve) => {
      for (const connection of this.#connections.values()) {
        connection.destroy();
      }
      this.#connections.clear();

      if (!this.#server) {
        return resolve();
      }

      debug('server stopped');
      this.#server.removeAllListeners();
      if (!this.#server.listening) {
        resolve();
      } else {
        this.#server.close(() => {
          resolve();
        });
      }
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
