'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');

const originalHttpRequest = http.request;
const originalHttpGet = http.get;
const originalHttpsRequest = https.request;
const originalHttpsGet = https.get;
const originalReadStreamRead = fs.ReadStream.prototype._read;
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

module.exports = {
  interceptClientRequest,
  interceptFileRead
};

/**
 * Listen for file system reads and report
 * @param {(string) => void} fn
 * @returns {() => void}
 */
function interceptFileRead(fn) {
  if (!(fs.readFile instanceof Proxy)) {
    // Proxy ReadStream private method to work around patching by graceful-fs
    const ReadStream = fs.ReadStream.prototype;

    ReadStream._read = new Proxy(ReadStream._read, {
      apply(target, ctx, args) {
        fn(ctx.path);
        return Reflect.apply(target, ctx, args);
      }
    });

    for (const method of ['readFile', 'readFileSync']) {
      fs[method] = new Proxy(fs[method], {
        apply(target, ctx, args) {
          fn(args[0]);
          return Reflect.apply(target, ctx, args);
        }
      });
    }
  }

  return restoreFileRead;
}

/**
 * Restore file read patch
 */
function restoreFileRead() {
  fs.ReadStream.prototype._read = originalReadStreamRead;
  fs.readFile = originalReadFile;
  fs.readFileSync = originalReadFileSync;
}

/**
 * Listen for client requests
 * @param {(URL) => boolean} fn
 * @returns {() => void}
 */
function interceptClientRequest(fn) {
  if (!(http.request instanceof Proxy)) {
    const apply = function apply(target, ctx, args) {
      const url = (args[0] = new URL(
        typeof args[0] === 'string' ? args[0] : getHrefFromRequestOptions(args[0])
      ));

      if (fn(url)) {
        if (url.hostname.includes('localhost')) {
          // Force to http
          url.protocol = 'http:';
          target =
            target === originalHttpsGet || target === originalHttpGet
              ? originalHttpGet
              : originalHttpRequest;
        }
        args[0] = url.href;
        return Reflect.apply(target, ctx, args);
      }
    };

    http.request = new Proxy(http.request, { apply });
    http.get = new Proxy(http.get, { apply });
    https.request = new Proxy(https.request, { apply });
    https.get = new Proxy(https.get, { apply });
  }

  return restoreClientRequest;
}

/**
 * Retrieve href from 'options'
 * @param {object} options
 * @returns {string}
 */
function getHrefFromRequestOptions(options) {
  if (options.href) {
    return options.href;
  }

  let { host = 'localhost', path, port = 80, protocol = 'http:' } = options;

  if (!host.includes(':')) {
    host += `:${port}`;
  }

  return `${protocol}//${host}${path}`;
}

/**
 * Restore client request patch
 */
function restoreClientRequest() {
  http.request = originalHttpRequest;
  http.get = originalHttpGet;
  https.request = originalHttpsRequest;
  https.get = originalHttpsGet;
}
