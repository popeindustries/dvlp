import type {
  Http2ServerRequest,
  Http2ServerResponse,
  IncomingMessage,
  ServerResponse,
} from '../types.ts';
import { EventEmitter } from 'node:events';

const DEFAULT_PING = 15 * 1000;
const DEFAULT_RETRY = 5 * 1000;
const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

export class EventSource extends EventEmitter {
  readyState: number;
  _res: ServerResponse & Http2ServerResponse;
  _pingIntervalId?: NodeJS.Timeout;

  /**
   * Determine if "req" is an EventSource request
   */
  static isEventSource(req: IncomingMessage | Http2ServerRequest) {
    return (
      req.method === 'GET' &&
      req.headers.accept !== undefined &&
      req.headers.accept.includes('text/event-stream')
    );
  }

  /**
   * Constructor
   */
  constructor(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse & Http2ServerResponse,
  ) {
    super();
    this.readyState = READY_STATE.CONNECTING;
    this._res = res;

    if (res.finished) {
      return;
    }

    req.socket.setKeepAlive(true);
    if (!res.hasHeader('Access-Control-Allow-Origin')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
    });

    this._write(`retry: ${Math.floor(DEFAULT_RETRY)}\r\n\r\n`);
    this._pingIntervalId = setInterval(() => {
      this.ping();
    }, DEFAULT_PING);

    for (const event of ['close', 'error']) {
      req.on(event, () => {
        this.close();
      });
    }

    process.nextTick(() => this._open());
  }

  /**
   * Send optional message and close the connection
   */
  end(message?: string) {
    if (message) {
      this.send(message);
    }
    this.close();
  }

  /**
   * Send message
   */
  send(message: string, options: { event?: string; id?: string } = {}) {
    if (this.readyState > READY_STATE.OPEN) {
      return false;
    }

    const { event, id } = options;
    const data = message.replace(/(\r\n|\r|\n)/g, '$1data: ');
    let frame = '';

    if (event) {
      frame += `event: ${event}\r\n`;
    }
    if (id) {
      frame += `id: ${id}\r\n`;
    }
    frame += `data: ${data}\r\n\r\n`;

    return this._write(frame);
  }

  /**
   * Ping client
   */
  ping() {
    return this._write(':\r\n\r\n');
  }

  /**
   * Close the connection
   */
  close() {
    if (this.readyState > READY_STATE.OPEN) {
      return false;
    }

    this.readyState = READY_STATE.CLOSING;

    if (this._pingIntervalId) {
      clearInterval(this._pingIntervalId);
    }
    this._res.end();
    // @ts-expect-error - clean up
    this._res = undefined;

    this.emit('close');

    this.readyState = READY_STATE.CLOSED;

    return true;
  }

  _open() {
    if (this.readyState !== READY_STATE.CONNECTING) {
      return;
    }

    this.readyState = READY_STATE.OPEN;
    this.emit('open');
  }

  _write(chunk: string): boolean {
    try {
      this._res.write(chunk);
      return true;
    } catch {
      this.close();
      return false;
    }
  }
}
