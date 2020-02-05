'use strict';

const config = require('../config.js');
const { URL } = require('url');

const RE_WEB_SOCKET = /wss?:/;

module.exports = {
  filePathToUrl,
  getUrl,
  getUrlCacheKey,
  isWebSocketUrl
};

/**
 * Determine if 'url' is a WebSocket
 *
 * @param { URL } url
 * @returns { boolean }
 */
function isWebSocketUrl(url) {
  return RE_WEB_SOCKET.test(url.protocol);
}

/**
 * Retrieve URL instance from 'req'
 *
 * @param { string | MockRequest | import("http").ClientRequest | URL } req
 * @returns { URL }
 */
function getUrl(req) {
  if (!(req instanceof URL)) {
    req = new URL(
      typeof req === 'string' ? decodeURIComponent(req) : req.url,
      `http://localhost:${config.activePort}`
    );
  }
  // Map loopback address to localhost
  if (req.hostname === '127.0.0.1') {
    req.hostname = 'localhost';
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
function getUrlCacheKey(url) {
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
function filePathToUrl(filePath) {
  return encodeURI(filePath.replace(/^[A-Z]:/, '').replace(/\\/g, '/'));
}
