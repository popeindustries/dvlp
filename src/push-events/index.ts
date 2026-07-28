import { getUrl, getUrlCacheKey, isWebSocketUrl } from '../utils/url.ts';
import type {
  PushClient,
  PushEvent,
  PushEventOptions,
  PushStream,
} from './types.ts';
import Debug from 'debug';
import deflate from 'permessage-deflate';
import { error } from '../utils/log.ts';
import { EventSource } from '../reload/event-source.ts';
// @ts-expect-error - missing types
import WebSocket from 'faye-websocket';

const RE_SOCKETIO_PROTOCOL = /socket\.?io|EIO/;

const cache: Map<string, Set<PushClient>> = new Map();
const debug = Debug('dvlp:push');

/**
 * Initialize EventSource/WebSocket client.
 * Returns the created client so callers can observe/drive the connection.
 */
export function connectClient(
  stream: string | PushStream,
  ...args: Array<any>
): PushClient {
  const { type, url } = getStream(stream);
  const cacheKey = getUrlCacheKey(getUrl(url));
  const clients = cache.get(cacheKey) ?? new Set();
  let client: PushClient;

  if (type === 'ws') {
    const [req, socket, body] = args;
    const isSocketio = RE_SOCKETIO_PROTOCOL.test(req.url);
    const extensionsHeaders = req.headers['Sec-WebSocket-Extensions'];
    const extensions =
      extensionsHeaders && extensionsHeaders.includes('permessage-deflate')
        ? [deflate]
        : [];
    const protocolHeader = req.headers['sec-websocket-protocol'] || '';
    const protocols = protocolHeader
      .split(',')
      .map((protocol: string) => protocol.trim());

    client = new WebSocket(req, socket, body, protocols, {
      extensions,
    });
    client.on('message', (event) => {
      const data = event?.data as string;

      debug('received ws message', data);

      // Handle Socket.io channel protocol
      // ex: 40/channel?somequery=foo
      if (isSocketio && typeof data === 'string') {
        const [packetAndChannel] = data.split('?');

        // Send separate packet and packet/channel responses
        if (packetAndChannel.includes('/')) {
          client.send(packetAndChannel.slice(0, packetAndChannel.indexOf('/')));
          client.send(packetAndChannel);
        }
      }
    });

    if (isSocketio) {
      client.send(
        '0{"sid":"dvlp","upgrades":[],"pingInterval":250000,"pingTimeout":600000}',
      );
    }
  } else {
    const [req, res, options] = args;

    client = new EventSource(req, res, options);
  }

  clients.add(client);
  cache.set(cacheKey, clients);
  debug(`added ${type} connection`, clients.size);

  client.on('close', () => {
    clients.delete(client);
    if (!clients.size) {
      cache.delete(cacheKey);
    }
    debug(`removed ${type} connection`, cache.size);
  });

  return client;
}

/**
 * Push event data to WebSocket/EventSource clients
 */
export function pushEvent(stream: string | PushStream, event: PushEvent): void {
  if (!stream || !event) {
    return;
  }

  const { url, type } = getStream(stream);
  const cacheKey = getUrlCacheKey(getUrl(url));
  const clients = cache.get(cacheKey);

  if (clients === undefined) {
    return error(`no push clients registered for ${url}`);
  }

  const encoded = encodePushEventMessage(event, type);

  if (encoded === undefined) {
    return;
  }

  debug(
    `push to ${clients.size} client${
      clients.size > 1 ? 's' : ''
    } connected on ${url}`,
  );
  debug(encoded.message);

  for (const client of clients) {
    client.send(encoded.message, encoded.options);
  }
}

/**
 * Encode push "event" message for transport "type".
 * Handles JSON stringification, binary buffers, socket.io framing,
 * and EventSource options. Returns "undefined" if the message cannot be sent.
 */
export function encodePushEventMessage(
  event: PushEvent,
  type: string,
): { message: string | Buffer; options?: PushEventOptions } | undefined {
  const { message } = event;
  const binaryMessage = toBinaryBuffer(message);
  let { options } = event;
  let payload: string | Buffer;

  if (binaryMessage !== undefined) {
    if (type !== 'ws') {
      error(`unable to push binary message to EventSource clients`);
      return;
    }

    // Binary messages skip socket.io framing (binary attachments are not
    // supported) and are sent as raw binary frames
    payload = binaryMessage;
    options = undefined;
  } else {
    if (typeof message === 'string') {
      payload = message;
    } else {
      try {
        payload = JSON.stringify(message);
      } catch {
        error(`unable to stringify message for push event`, message);
        return;
      }
    }

    if (type === 'ws' && options !== undefined) {
      const { event = '', namespace = '/', protocol } = options;

      // Handle socket.io protocol
      // https://github.com/socketio/socket.io-protocol/blob/master/Readme.md
      if (protocol && RE_SOCKETIO_PROTOCOL.test(protocol)) {
        payload = `42${namespace},["${event}",${payload}]`;
      }
      options = undefined;
    }
  }

  return { message: payload, options };
}

/**
 * Convert binary-ish "message" (Buffer/ArrayBuffer/TypedArray/DataView)
 * to a Buffer, or "undefined" if not binary
 */
function toBinaryBuffer(message: unknown): Buffer | undefined {
  if (Buffer.isBuffer(message)) {
    return message;
  }
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message);
  }
  if (ArrayBuffer.isView(message)) {
    return Buffer.from(message.buffer, message.byteOffset, message.byteLength);
  }
}

/**
 * Retrieve PushStream from 'stream'
 * If passed as string, will determine type from url
 */
function getStream(stream: string | PushStream): PushStream {
  if (typeof stream === 'string') {
    const url = getUrl(stream);
    const isWebSocket = isWebSocketUrl(url);

    stream = {
      url: url.href,
      type: isWebSocket ? 'ws' : 'es',
    };
  }

  return stream;
}
