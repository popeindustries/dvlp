import type {
  MockStream,
  MockStreamConnection,
  MockStreamContext,
  MockStreamOptions,
} from './types.ts';
import type {
  PushClient,
  PushEvent,
  PushEventOptions,
} from '../push-events/types.ts';
import Debug from 'debug';
import type { Duplex } from 'node:stream';
import { encodePushEventMessage } from '../push-events/index.ts';
import { EventEmitter } from 'node:events';

const CLOSE_FALLBACK_TIMEOUT = 1000;

const debug = Debug('dvlp:mockstream');
let connectionCount = 0;

/**
 * Parse and trim "Sec-WebSocket-Protocol" header entries
 */
export function parseWebSocketProtocols(header?: string): Array<string> {
  if (!header) {
    return [];
  }

  return header
    .split(',')
    .map((protocol) => protocol.trim())
    .filter((protocol) => protocol.length > 0);
}

export class MockStreamInstance implements MockStream {
  url: URL;
  type: 'ws' | 'es';
  connections: Array<MockStreamConnection> = [];
  options: MockStreamOptions;

  #legacyMessageListener: ((data: string | Buffer) => void) | undefined;
  #messageListeners = new Set<(data: string | Buffer) => void>();
  #push: (event: string | PushEvent) => void;

  constructor(
    url: URL,
    type: 'ws' | 'es',
    options: MockStreamOptions = {},
    push: (event: string | PushEvent) => void,
  ) {
    this.url = url;
    this.type = type;
    this.options = options;
    this.#push = push;
  }

  /**
   * Determine if connection described by "context" is authorized
   */
  authorize(context: MockStreamContext): boolean {
    return this.options.authorize?.(context) ?? true;
  }

  /**
   * Wrap connected "client" in a connection handle,
   * notifying "onConnection" and registered message listeners
   */
  addConnection(
    client: PushClient,
    context: MockStreamContext,
    socket?: Duplex,
  ): MockStreamConnection {
    const connection = new MockStreamConnectionInstance(
      this.type,
      client,
      context,
      this.options.ping ?? false,
      socket,
    );

    this.connections.push(connection);
    connection.once('close', () => {
      const index = this.connections.indexOf(connection);

      if (index !== -1) {
        this.connections.splice(index, 1);
      }
    });

    for (const listener of this.#messageListeners) {
      connection.on('message', listener);
    }
    this.options.onConnection?.(connection);

    return connection;
  }

  /**
   * Register "listener" for messages on current and future connections
   */
  onMessage(listener: (data: string | Buffer) => void): void {
    this.#messageListeners.add(listener);

    for (const connection of this.connections) {
      connection.on('message', listener);
    }
  }

  /**
   * Register the legacy "mockPushEvents" send callback,
   * replacing any previously registered one (last-wins, pre-18 semantics)
   */
  setLegacyMessageListener(listener: (data: string | Buffer) => void): void {
    if (this.#legacyMessageListener !== undefined) {
      this.#messageListeners.delete(this.#legacyMessageListener);

      for (const connection of this.connections) {
        connection.off('message', this.#legacyMessageListener);
      }
    }

    this.#legacyMessageListener = listener;
    this.onMessage(listener);
  }

  pushEvent(event: string | PushEvent): void {
    this.#push(event);
  }

  destroy(): void {
    for (const connection of [...this.connections]) {
      connection.close();
    }
    this.connections.length = 0;
    this.#legacyMessageListener = undefined;
    this.#messageListeners.clear();
  }
}

class MockStreamConnectionInstance
  extends EventEmitter
  implements MockStreamConnection
{
  id: string;
  type: 'ws' | 'es';
  url: URL;
  headers: MockStreamContext['headers'];
  protocols: Array<string>;
  closed = false;

  #client: PushClient;
  #pingTimer: NodeJS.Timeout | undefined;
  #socket: Duplex | undefined;

  constructor(
    type: 'ws' | 'es',
    client: PushClient,
    context: MockStreamContext,
    pingInterval: number | false,
    socket?: Duplex,
  ) {
    super();

    this.id = `connection-${++connectionCount}`;
    this.type = type;
    this.url = context.url;
    this.headers = context.headers;
    this.protocols = context.protocols;
    this.#client = client;
    this.#socket = socket;

    client.on('message', (event) => {
      this.emit('message', event?.data);
    });
    client.on('close', (event) => {
      this.#onClose(event?.code, event?.reason);
    });

    // EventSource pings are handled via its own pingInterval option
    if (type === 'ws' && pingInterval !== false && pingInterval > 0) {
      let pingId = 0;

      this.#pingTimer = setInterval(() => {
        this.#client.ping?.(String(++pingId));
      }, pingInterval);
      this.#pingTimer.unref?.();
    }

    debug(`created ${type} connection "${this.id}" for "${this.url.href}"`);
  }

  send(message: PushEvent['message'], options?: PushEventOptions): void {
    if (this.closed) {
      return;
    }

    const encoded = encodePushEventMessage({ message, options }, this.type);

    if (encoded !== undefined) {
      this.#client.send(encoded.message, encoded.options);
    }
  }

  ping(message?: string, onPong?: () => void): void {
    if (!this.closed) {
      this.#client.ping?.(message ?? '', onPong);
    }
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) {
      return;
    }

    if (this.type === 'es') {
      this.#client.close();
      return;
    }

    if (code === 1000 || (code >= 3000 && code <= 4999)) {
      this.#client.close(code, reason);
      return;
    }

    // faye-websocket only permits codes 1000/3000-4999, but the underlying
    // driver can frame any code (note its reversed argument order)
    const driver = (
      this.#client as unknown as {
        _driver?: { close(reason: string, code: number): void };
      }
    )._driver;

    if (typeof driver?.close === 'function') {
      driver.close(reason, code);

      // The bypass skips faye's own close bookkeeping, so force teardown
      // if the peer never echoes the close frame
      setTimeout(() => {
        if (!this.closed) {
          this.#socket?.destroy();
        }
      }, CLOSE_FALLBACK_TIMEOUT).unref?.();
    } else {
      this.#client.close();
    }
  }

  #onClose(code?: number, reason?: string): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    clearInterval(this.#pingTimer);

    debug(`closed connection "${this.id}" (${code ?? ''} ${reason ?? ''})`);
    this.emit('close', { code, reason });
  }
}
