import { connectClient, pushEvent } from '../push-events/index.ts';
import { getUrl, getUrlCacheKey, isWebSocketUrl } from '../utils/url.ts';
import type {
  MockedResponse,
  MockPushEvent,
  MockPushStream,
  MockRequest,
  MockResponse,
  MockResponseHandler,
} from '../mock/types.ts';
import type {
  MockStream,
  MockStreamOptions,
  TestServerOptions,
} from './types.ts';
import { MockStreamInstance, parseWebSocketProtocols } from './mock-stream.ts';
import type {
  PushClient,
  PushEvent,
  PushStream,
} from '../push-events/types.ts';
import config from '../config.ts';
import Debug from 'debug';
import type { Duplex } from 'node:stream';
import { EventSource } from '../reload/event-source.ts';
import fs from 'node:fs';
import { getType } from '../utils/mime.ts';
import http from 'node:http';
import type { HttpServer } from '../types.ts';
import { Metrics } from '../utils/metrics.ts';
import { Mocks } from '../mock/index.ts';
import path from 'node:path';
// @ts-expect-error - missing types
import WebSocket from 'faye-websocket';

const debug = Debug('dvlp:test');

export class TestServer {
  latency: number;
  webroot: string;
  port: number;
  mocks: Mocks;

  #autorespond: boolean;
  #connections: Map<string, Duplex> = new Map();
  // Push clients connected to this instance, so destroy() only closes
  // its own connections when multiple instances share a process
  #pushClients: Set<PushClient> = new Set();
  #server: HttpServer | undefined;
  #streams: Map<string, MockStreamInstance> = new Map();

  /**
   * Constructor
   */
  constructor(options: TestServerOptions) {
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
   */
  private _start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#server = http.createServer(async (req, res) => {
        // @ts-expect-error - exists
        res.url ??= req.url;
        // @ts-expect-error - exists
        res.metrics = new Metrics(res);

        if (EventSource.isEventSource(req)) {
          const url = new URL(
            req.url as string,
            `http://localhost:${this.port}`,
          );
          const stream = this.#streams.get(getUrlCacheKey(url));
          const context = { headers: req.headers, protocols: [], url };

          if (stream !== undefined && !stream.authorize(context)) {
            debug(`unauthorized es connection for "${url.href}"`);
            res.writeHead(401);
            res.end();
            return;
          }

          // Register with the absolute url so the push-client key
          // resolves against this instance's port, not the global one
          const client = connectClient(
            {
              url: url.href,
              type: 'es',
            },
            req,
            res,
            stream !== undefined
              ? {
                  pingInterval: stream.options.ping,
                  retry: stream.options.retry,
                }
              : undefined,
          );

          this.#trackPushClient(client);
          stream?.addConnection(client, context);
          this.pushEvent(url.href, 'connect');
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
        const headers: Record<string, string> = {};
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
      this.#server.on('listening', () => {
        const address = this.#server?.address();

        // Resolve the actual bound port (supports ephemeral "port: 0").
        // Safe for mock registration keying because the testServer() factory
        // awaits start before returning the instance.
        if (address !== null && typeof address === 'object') {
          this.port = address.port;
        }
        config.activePort = this.port;
        this.mocks.activePort = this.port;

        resolve();
      });
      this.#server.on('connection', (connection) => {
        const key = `${connection.remoteAddress}:${connection.remotePort}`;

        this.#connections.set(key, connection);
        connection.once('close', () => {
          this.#connections.delete(key);
        });
      });
      this.#server.on('upgrade', (req, socket, body) => {
        if (WebSocket.isWebSocket(req)) {
          const url = new URL(req.url as string, `ws://${req.headers.host}`);
          const stream = this.#streams.get(getUrlCacheKey(url));
          const context = {
            headers: req.headers,
            protocols: parseWebSocketProtocols(
              req.headers['sec-websocket-protocol'],
            ),
            url,
          };

          if (stream !== undefined && !stream.authorize(context)) {
            debug(`unauthorized ws connection for "${url.href}"`);
            // end() (not destroy()) so the 401 is flushed before FIN
            socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
            return;
          }

          const client = connectClient(
            {
              url: url.href,
              type: 'ws',
            },
            req,
            socket,
            body,
          );

          this.#trackPushClient(client);
          stream?.addConnection(client, context, socket);

          this.pushEvent(url.href, 'connect');
        }
      });

      this.#server.listen(this.port);
    });
  }

  /**
   * Load mock files at 'filePath'
   */
  loadMockFiles(filePath: string | Array<string>) {
    return this.mocks.load(filePath);
  }

  /**
   * Register mock 'response' for 'request'.
   * Returns a handle that removes the mock when called,
   * and exposes matched requests via its "calls" array.
   */
  mockResponse(
    request: string | MockRequest,
    response: MockResponse | MockResponseHandler,
    once = false,
    onMockCallback?: () => void,
  ): MockedResponse {
    return this.mocks.addResponse(request, response, once, onMockCallback);
  }

  /**
   * Register a mock stream at 'url', returning a handle exposing live
   * connections for request/reply, per-connection send, and close with code
   */
  mockStream(url: string, options?: MockStreamOptions): MockStream {
    const streamUrl = getUrl(url, this.port);
    const key = getUrlCacheKey(streamUrl);
    const existing = this.#streams.get(key);

    if (existing !== undefined) {
      debug(`replacing existing mock stream for "${url}"`);
      existing.destroy();
    }

    const stream = new MockStreamInstance(
      streamUrl,
      isWebSocketUrl(streamUrl) ? 'ws' : 'es',
      options,
      (event) => {
        this.pushEvent(url, event);
      },
    );

    this.#streams.set(key, stream);

    return stream;
  }

  /**
   * Register mock push 'events' for 'stream'
   *
   * @param onSendCallback - WS client send callback.
   * Superseded by `mockStream()`, which exposes per-connection handles.
   */
  mockPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>,
    onSendCallback?: (data: any) => void,
  ) {
    if (onSendCallback) {
      const streamUrl = typeof stream === 'string' ? stream : stream.url;
      const key = getUrlCacheKey(getUrl(streamUrl, this.port));
      const registration =
        this.#streams.get(key) ??
        (this.mockStream(streamUrl) as MockStreamInstance);

      registration.setLegacyMessageListener(onSendCallback);
    }
    return this.mocks.addPushEvents(stream, events);
  }

  /**
   * Push data to WebSocket/EventSource clients
   * A string passed as 'event' will be handled as a named mock push event
   */
  pushEvent(stream: string | PushStream, event?: string | PushEvent): void {
    // Resolve relative stream urls against this instance's port,
    // so push clients are found regardless of instance creation order
    const resolved =
      typeof stream === 'string'
        ? getUrl(stream, this.port).href
        : { ...stream, url: getUrl(stream.url, this.port).href };

    // Passed a mocked event name
    if (typeof event === 'string') {
      this.mocks.matchPushEvent(resolved, event, pushEvent);
    } else {
      // @ts-expect-error - non-null
      pushEvent(resolved, event);
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
   */
  private _stop(): Promise<void> {
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
   */
  destroy(): Promise<void> {
    debug('destroying');
    for (const stream of this.#streams.values()) {
      stream.destroy();
    }
    this.#streams.clear();

    // Close only this instance's push clients, leaving other instances
    // in the same process connected. Closing (rather than removing
    // listeners) lets the shared push-client registry self-clean
    for (const client of this.#pushClients) {
      client.close();
    }
    this.#pushClients.clear();

    this.mocks.clear();
    return this._stop();
  }

  /**
   * Track push 'client' for cleanup on destroy()
   */
  #trackPushClient(client: PushClient): void {
    this.#pushClients.add(client);
    client.on('close', () => {
      this.#pushClients.delete(client);
    });
  }
}

/**
 * Sleep for random number of milliseconds between 'min' and '2xmin'
 */
function sleep(min: number): Promise<void> {
  return new Promise((resolve) => {
    if (!min) {
      return resolve();
    }
    setTimeout(resolve, min + Math.random() * min);
  });
}
