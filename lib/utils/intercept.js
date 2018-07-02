'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const clientRequestListeners = new Set();
const fileReadListeners = new Set();
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
        if (notifyListeners(fileReadListeners, ctx.path) === false) {
          return;
        }
        return Reflect.apply(target, ctx, args);
      }
    });

    for (const method of ['readFile', 'readFileSync']) {
      fs[method] = new Proxy(fs[method], {
        apply(target, ctx, args) {
          if (notifyListeners(fileReadListeners, args[0]) === false) {
            return;
          }
          return Reflect.apply(target, ctx, args);
        }
      });
    }
  }

  fileReadListeners.add(fn);
  return restoreFileRead.bind(null, fn);
}

/**
 * Restore unproxied file reading behaviour
 * @param {function} fn
 */
function restoreFileRead(fn) {
  fileReadListeners.delete(fn);
  if (!fileReadListeners.size) {
    fs.ReadStream.prototype._read = originalReadStreamRead;
    fs.readFile = originalReadFile;
    fs.readFileSync = originalReadFileSync;
  }
}

/**
 * Listen for client requests
 * @param {(URL) => boolean} fn
 * @returns {() => void}
 */
function interceptClientRequest(fn) {
  if (!(http.request instanceof Proxy)) {
    http.request = new Proxy(http.request, { apply: clientRequestApplyTrap('http') });
    http.get = new Proxy(http.get, { apply: clientRequestApplyTrap('http') });
    https.request = new Proxy(https.request, { apply: clientRequestApplyTrap('https') });
    https.get = new Proxy(https.get, { apply: clientRequestApplyTrap('https') });
  }

  clientRequestListeners.add(fn);
  return restoreClientRequest.bind(null, fn);
}

/**
 * Create client request Proxy apply trap for 'protocol'
 * @param {string} protocol
 * @returns {function}
 */
function clientRequestApplyTrap(protocol) {
  return function apply(target, ctx, args) {
    const isString = typeof args[0] === 'string';
    const url = new URL(isString ? args[0] : getHrefFromRequestOptions(args[0], protocol));

    // TODO: pass method/headers
    if (notifyListeners(clientRequestListeners, url) === false) {
      return;
    }

    if (url.hostname.includes('localhost')) {
      // Force to http
      url.protocol = 'http:';
      target =
        target === originalHttpsGet || target === originalHttpGet
          ? originalHttpGet
          : originalHttpRequest;
    }
    if (isString) {
      args[0] = url.href;
    } else {
      args[0].protocol = url.protocol;
      args[0].host = url.host;
      args[0].hostname = url.hostname;
      args[0].port = url.port;
      args[0].path = `${url.href.replace(url.origin, '')}`;
      args[0].href = url.href;
    }

    return Reflect.apply(target, ctx, args);
  };
}

/**
 * Retrieve href from 'options'
 * @param {object} options
 * @returns {string}
 */
function getHrefFromRequestOptions(options, protocol) {
  if (options.href) {
    return options.href;
  }

  let { host = 'localhost', path, port } = options;
  if (!host.includes(':') && port != null) {
    host += `:${port}`;
  }

  return `${protocol}://${host}${path}`;
}

/**
 * Restore unproxied client request behaviour
 * @param {function} fn
 */
function restoreClientRequest(fn) {
  clientRequestListeners.delete(fn);
  if (!clientRequestListeners.size) {
    http.request = originalHttpRequest;
    http.get = originalHttpGet;
    https.request = originalHttpsRequest;
    https.get = originalHttpsGet;
  }
}

/**
 * Notify 'listeners' with 'args'
 * @param {Set} listeners
 */
function notifyListeners(listeners, ...args) {
  for (const listener of listeners) {
    if (listener(...args) === false) {
      return false;
    }
  }
}
