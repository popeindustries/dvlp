import config from '../config.ts';

const RE_WEB_SOCKET = /wss?:/;

/**
 * Determine if 'url' is a WebSocket
 */
export function isWebSocketUrl(url: URL): boolean {
  return RE_WEB_SOCKET.test(url.protocol);
}

/**
 * Retrieve URL instance from 'req'
 */
export function getUrl(req: string | { url: string } | URL): URL {
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
 * @private
 */
export function getUrlCacheKey(url: URL): string {
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
 */
export function filePathToUrlPathname(filePath: string): string {
  return encodeURI(
    filePath
      .replace(/^(?:file:\/\/)|(?:[a-zA-Z]:[\\/])/, '/')
      .replace(/\\/g, '/'),
  );
}

/**
 * Determine if search params are equal
 */
export function isEqualSearchParams(
  params1: URLSearchParams,
  params2: URLSearchParams,
): boolean {
  const keys1 = Array.from(params1.keys());
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
