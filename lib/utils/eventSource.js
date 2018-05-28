'use strict';

/**
 * Create SSE instance
 * @returns {object}
 */
module.exports = function eventSource() {
  const clients = new Set();

  return {
    /**
     * Determine if 'req' is an EventSource connection
     * @param {http.ClientRequest} req
     * @returns {boolean}
     */
    match(req) {
      return req.url === '/reload';
    },

    /**
     * Handle EventSource connection
     * @param {http.ClientRequest} req
     * @param {http.ServerResponse} res
     */
    handle(req, res) {
      const client = { req, res };

      req.socket.setNoDelay(true);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok\n\n');

      res.on('close', () => {
        res.removeAllListeners();
        clients.delete(client);
        delete client.res;
        delete client.req;
      });
    },

    /**
     * Send 'event' with 'data' to all clients
     * @param {string} event
     * @param {object} [data]
     */
    send(event, data = {}) {
      const msg = `event: ${event}\nretry: 1000\ndata: ${JSON.stringify(data)}\n\n`;

      for (const client of clients) {
        client.res.write(msg);
      }
    },

    /**
     * Clean up
     */
    close() {
      for (const client of clients) {
        client.res.close();
      }
      clients.clear();
    }
  };
};
