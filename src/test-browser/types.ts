import type { PushEvent, PushEventOptions } from '../push-events/types.ts';

/**
 * Browser variants of the node MockStream types.
 * Same names/shape/semantics, minus what the browser environment
 * can't provide: request headers are not readable in-page, and
 * ping frames / ping-retry intervals are invisible to page script.
 */

export interface MockStreamOptions {
  /**
   * Inspect the connection (`Sec-WebSocket-Protocol` entries, url) and return
   * `false` to reject it (default: always authorized). Rejection surfaces as
   * a client `error` event (the browser can't answer with a `401` in-page).
   */
  authorize?: (context: MockStreamContext) => boolean;
  /**
   * Called with a connection handle each time a client connects.
   */
  onConnection?: (connection: MockStreamConnection) => void;
}

export interface MockStreamContext {
  /**
   * Always empty in the browser (request headers are not readable in-page).
   */
  headers: Record<string, string>;
  /**
   * Protocols passed to the `WebSocket` constructor (empty for EventSource).
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
  /**
   * Always empty in the browser (request headers are not readable in-page).
   */
  headers: Record<string, string>;
  protocols: Array<string>;
  readonly closed: boolean;
  /**
   * Send a message on this connection only (same encoding rules as `pushEvent`).
   */
  send(message: PushEvent['message'], options?: PushEventOptions): void;
  /**
   * Close this connection. For WebSocket, browsers only permit close codes
   * `1000`/`3000-4999`; other codes fall back to a plain close.
   */
  close(code?: number, reason?: string): void;
  on(
    event: 'message',
    handler: (data: string | Blob | ArrayBuffer | ArrayBufferView) => void,
  ): this;
  on(
    event: 'close',
    handler: (event: { code?: number; reason?: string }) => void,
  ): this;
  once(
    event: 'message',
    handler: (data: string | Blob | ArrayBuffer | ArrayBufferView) => void,
  ): this;
  once(
    event: 'close',
    handler: (event: { code?: number; reason?: string }) => void,
  ): this;
  off(
    event: 'message',
    handler: (data: string | Blob | ArrayBuffer | ArrayBufferView) => void,
  ): this;
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
   * Broadcast to all connections (same semantics as `pushEvent`).
   */
  pushEvent(event: string | PushEvent): Promise<void>;
  /**
   * Close all connections and unregister the stream.
   */
  destroy(): void;
}
