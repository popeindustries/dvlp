'use strict';

const debug = require('debug')('dvlp:push');
const WebSocket = require('faye-websocket');

const DEFAULT_ES_CONFIG = {
  headers: { 'Access-Control-Allow-Origin': '*' },
  ping: 15,
  retry: 10
};

const { EventSource } = WebSocket;

module.exports = {
  destroyPushClients,
  initPushClient,
  push
};

/**
 * Initialize EventSource/WebSocket client
 *
 * @param { Set<object> } clientsCache
 * @param { string } type
 * @param { ...any } args
 * @returns { void }
 */
function initPushClient(clientsCache, type, ...args) {
  const isWebSocket = type === 'ws';
  const Ctor = isWebSocket ? WebSocket : EventSource;
  const options = isWebSocket ? {} : DEFAULT_ES_CONFIG;
  const client = new Ctor(...args, options);

  clientsCache.add(client);
  debug(`added ${type} connection`, clientsCache.size);

  client.on('close', () => {
    clientsCache.delete(client);
    debug(`removed ${type} connection`, clientsCache.size);
  });
  if (isWebSocket) {
    client.on('message', (event) => {
      debug('received ws message', event.data);
    });
  }
}

/**
 * Push data to WebSocket/EventSource clients
 *
 * @param { Set<object> } clientsCache
 * @param { string | Buffer } message
 * @param { object } [options] - EventSource options
 * @param { string } [options.event] - event name
 * @param { string } [options.id] - event id
 * @returns { void }
 */
function push(clientsCache, message, options) {
  if (clientsCache.size) {
    for (const client of clientsCache) {
      client.send(message, options);
    }
  }
}

/**
 * Destroy all active push clients
 * @param { Set<object> } clientsCache
 * @returns { void }
 */
function destroyPushClients(clientsCache) {
  for (const client of clientsCache) {
    client.removeAllListeners();
    client.close();
  }
  clientsCache.clear();
}
