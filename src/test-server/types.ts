import type { PushEvent, PushEventOptions } from '../push-events/types.ts';
import type { IncomingHttpHeaders } from 'node:http';

export interface MockStreamOptions {
  /**
   * Inspect the connection request (headers, Sec-WebSocket-Protocol entries, url)
   * and return `false` to reject it with a `401` response (default: always authorized).
   */
  authorize?: (context: MockStreamContext) => boolean;
  /**
   * WebSocket ping-frame / EventSource comment interval in `ms`, or `false` to disable
   * (default `false` for WebSocket, `15000` for EventSource).
   */
  ping?: number | false;
  /**
   * EventSource reconnect interval in `ms`, sent to clients as the
   * `retry:` field (default `5000`; ignored for WebSocket).
   */
  retry?: number;
  /**
   * Called with a connection handle each time a client connects.
   */
  onConnection?: (connection: MockStreamConnection) => void;
}

export interface MockStreamContext {
  headers: IncomingHttpHeaders;
  /**
   * Parsed and trimmed `Sec-WebSocket-Protocol` entries (empty for EventSource).
   */
  protocols: Array<string>;
  url: URL;
}

export interface MockStreamConnection {
  /**
   * Unique per-connection id (new on every (re)connect).
   */
  id: string;
  type: 'ws' | 'es';
  url: URL;
  headers: IncomingHttpHeaders;
  protocols: Array<string>;
  readonly closed: boolean;
  /**
   * Send a message on this connection only (same encoding rules as `pushEvent`).
   */
  send(message: PushEvent['message'], options?: PushEventOptions): void;
  /**
   * Send a WebSocket ping frame (`onPong` fires when the client answers),
   * or an EventSource comment.
   */
  ping(message?: string, onPong?: () => void): void;
  /**
   * Close this connection. For WebSocket, `code` may be any close code:
   * `1000`/`3000-4999` use the spec-compliant path, others are framed directly.
   */
  close(code?: number, reason?: string): void;
  on(event: 'message', handler: (data: string | Buffer) => void): this;
  on(
    event: 'close',
    handler: (event: { code?: number; reason?: string }) => void,
  ): this;
  once(event: 'message', handler: (data: string | Buffer) => void): this;
  once(
    event: 'close',
    handler: (event: { code?: number; reason?: string }) => void,
  ): this;
  off(event: 'message', handler: (data: string | Buffer) => void): this;
  off(
    event: 'close',
    handler: (event: { code?: number; reason?: string }) => void,
  ): this;
}

export interface MockStream {
  url: URL;
  type: 'ws' | 'es';
  /**
   * Live connections in connect order.
   */
  connections: Array<MockStreamConnection>;
  /**
   * Broadcast to all connections (same semantics as `TestServer.pushEvent`).
   */
  pushEvent(event: string | PushEvent): void;
  /**
   * Close all connections and unregister the stream.
   */
  destroy(): void;
}

export interface TestServerOptions {
  /**
   * Enable/disable automatic dummy responses.
   * If unable to resolve a request to a local file or mock,
   * the server will respond with a dummy file of the appropriate type (default `true`).
   */
  autorespond?: boolean;
  /**
   * The amount of artificial latency to introduce (in `ms`) for responses (default `50`).
   */
  latency?: number;
  /**
   * The port to expose on `localhost`. Will use `process.env.PORT` if not specified here (default `8080`).
   */
  port?: number;
  /**
   * The subpath from `process.cwd()` to prepend to relative paths (default `''`).
   */
  webroot?: string;
}
