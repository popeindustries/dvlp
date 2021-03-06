import config from '../config.js';
import { URL } from 'url';

const RE_WEB_SOCKET = /wss?:/;

/**
 * Determine if 'url' is a WebSocket
 *
 * @param { URL } url
 * @returns { boolean }
 */
export function isWebSocketUrl(url) {
  return RE_WEB_SOCKET.test(url.protocol);
}

/**
 * Retrieve URL instance from 'req'
 *
 * @param { string | { url: string } | URL } req
 * @returns { URL }
 */
export function getUrl(req) {
  if (!(req instanceof URL)) {
    req = new URL(
      typeof req === 'string' ? decodeURIComponent(req) : req.url,
      `http://localhost:${config.applicationPort}`,
    );
  }
  // Map loopback address to localhost
  if (req.hostname === '127.0.0.1') {
    req.hostname = 'localhost';
  }
  if (req.pathname.endsWith('/')) {
    req.pathname = req.pathname.slice(0, -1);
  }

  return req;
}

/**
 * Retrieve key for 'url'
 *
 * @param { URL } url
 * @returns { string }
 * @private
 */
export function getUrlCacheKey(url) {
  // Map loopback address to localhost
  const host = url.host === '127.0.0.1' ? 'localhost' : url.host;
  let key = `${host}${url.pathname}`;

  if (key.endsWith('/')) {
    key = key.slice(0, -1);
  }

  return key;
}

/**
 * Convert file path to valid url
 * Handles platform differences
 *
 * @param { string } filePath
 * @returns { string }
 */
export function filePathToUrl(filePath) {
  return encodeURI(filePath.replace(/^[A-Z]:\\/, '/').replace(/\\/g, '/'));
}
