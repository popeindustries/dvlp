'use strict';

const Event = require('events');
const Parser = require('livereload-protocol');

const TIMEOUT = 1000;

module.exports = class ReloadConnection extends Event {
  /**
   * Constructor
   * @param {WebSocket} socket
   * @param {string} id
   * @param {object} options
   */
  constructor(socket, id, options) {
    super();

    let timeoutID = null;

    this.socket = socket;
    this.id = id;
    this.parser = new Parser('server', {
      monitoring: [Parser.protocols.MONITORING_7],
      conncheck: [Parser.protocols.CONN_CHECK_1],
      saving: [Parser.protocols.SAVING_1]
    });

    // Register for socket events
    this.socket.on('message', (data) => {
      this.parser.received(data.utf8Data);
    });
    this.socket.on('close', () => {
      if (timeoutID) {
        clearTimeout(timeoutID);
      }
      this.emit('disconnected');
    });
    this.socket.on('error', (err) => {
      this.socket.close();
      this.emit('error', err);
    });

    // Register for parser events
    this.parser.on('command', (cmd) => {
      if (cmd.command === 'ping') {
        this.send({ command: 'pong', token: cmd.token });
      } else {
        this.emit('command', cmd);
      }
    });
    this.parser.on('connected', () => {
      if (timeoutID) {
        clearTimeout(timeoutID);
      }
      this.send(this.parser.hello(options));
      this.emit('connected');
    });

    // Start handshake timeout
    timeoutID = setTimeout(() => {
      timeoutID = null;
      this.close();
    }, TIMEOUT);
  }

  /**
   * Get active state
   * @returns {boolean}
   */
  isActive() {
    if (this.parser.negotiatedProtocols != null) {
      return this.parser.negotiatedProtocols.monitoring >= 7;
    }
  }

  /**
   * Send 'msg' to client
   * @param {object} msg
   */
  send(msg) {
    this.parser.sending(msg);
    this.socket.send(JSON.stringify(msg));
  }

  /**
   * Close connection
   */
  close() {
    this.socket.close();
  }
};
