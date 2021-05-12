import { EventEmitter } from 'events';

const DEFAULT_PING = 15 * 1000;
const DEFAULT_RETRY = 10 * 1000;
/** @enum { number } */
const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

export class EventSource extends EventEmitter {
  /**
   * Determine if "req" is an EventSource request
   *
   * @param { _dvlp.IncomingMessage | _dvlp.Http2ServerRequest } req
   */
  static isEventSource(req) {
    return req.method === 'GET' && req.headers.accept !== undefined && req.headers.accept.includes('text/event-stream');
  }

  /**
   * Constructor
   *
   * @param { _dvlp.IncomingMessage | _dvlp.Http2ServerRequest } req
   * @param { _dvlp.ServerResponse | _dvlp.Http2ServerResponse } res
   */
  constructor(req, res) {
    super();
    this.readyState = READY_STATE.CONNECTING;
    this._isHttp2 = req.httpVersion.startsWith('2');
    this._res = res;

    if (res.finished) {
      return;
    }

    const handshake =
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: text/event-stream\r\n' +
      'Cache-Control: no-cache, no-store\r\n' +
      'Connection: close\r\n' +
      'Access-Control-Allow-Origin: *\r\n' +
      '\r\n' +
      'retry: ' +
      Math.floor(DEFAULT_RETRY) +
      '\r\n\r\n';

    this._write(handshake);
    this._pingIntervalId = setInterval(() => {
      this.ping();
    }, DEFAULT_PING);

    // TODO: listen for socket error event?
    res.on('close', () => {
      this.close();
    });

    process.nextTick(() => this._open());
  }

  /**
   * Send optional message and close the connection
   *
   * @param { string } [message]
   */
  end(message) {
    if (message) {
      this.send(message);
    }
    this.close();
  }

  /**
   * Send message
   *
   * @param { string } message
   * @param { { event?: string, id?: string } } [options]
   */
  send(message, options = {}) {
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

    this.readyState = READY_STATE.CLOSED;
    if (this._pingIntervalId) {
      clearInterval(this._pingIntervalId);
    }
    this._res.end();
    // @ts-ignore
    this._res = undefined;

    this.emit('close');

    return true;
  }

  /**
   * @private
   */
  _open() {
    if (this.readyState !== READY_STATE.CONNECTING) {
      return;
    }

    this.readyState = READY_STATE.OPEN;
    this.emit('open');
  }

  /**
   * @param { string } chunk
   * @returns { boolean }
   * @private
   */
  _write(chunk) {
    try {
      // @ts-ignore
      return this._res.write(chunk);
    } catch (err) {
      console.log(err);
      return false;
    }
  }
}
