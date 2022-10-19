import config from '../config.js';

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
      `http://localhost:${config.activePort}`,
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

/**
 * Determine if search params are equal
 *
 * @param { URLSearchParams } params1
 * @param { URLSearchParams } params2
 * @returns { boolean }
 */
export function isEqualSearchParams(params1, params2) {
  // @ts-ignore
  const keys1 = Array.from(params1.keys());
  // @ts-ignore
  const keys2 = Array.from(params2.keys());

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    const values1 = params1.getAll(key);
    const values2 = params2.getAll(key);

    if (values1.length !== values2.length) {
      return false;
    }

    for (const value of values1) {
      if (!values2.includes(value)) {
        return false;
      }
    }
  }

  return true;
}
