'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const { isLocalhost, isProxy } = require('./is.js');
const { URL } = require('url');

/** @type { Set<InterceptClientRequestCallback> } */
const clientRequestListeners = new Set();
/** @type { Set<InterceptFileReadCallback> } */
const fileReadListeners = new Set();
/** @type { Set<InterceptProcessOnCallback> } */
const processOnListeners = new Set();
const originalHttpRequest = http.request;
const originalHttpGet = http.get;
const originalHttpsRequest = https.request;
const originalHttpsGet = https.get;
const originalProcessOn = process.on;
const originalReadStreamRead = fs.ReadStream.prototype._read;
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

/** @typedef { import("http").ClientRequestArgs & { href?: string } } ClientRequestArgs */

module.exports = {
  interceptClientRequest,
  interceptFileRead,
  interceptProcessOn
};

/**
 * Listen for file system reads and report
 *
 * @param { InterceptFileReadCallback } fn
 * @returns { () => void }
 */
function interceptFileRead(fn) {
  if (!isProxy(fs.readFile)) {
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
      // @ts-ignore
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
 *
 * @param { InterceptFileReadCallback } fn
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
 *
 * @param { InterceptClientRequestCallback } fn
 * @returns { () => void }
 */
function interceptClientRequest(fn) {
  if (!isProxy(http.request)) {
    // @ts-ignore
    http.request = new Proxy(http.request, {
      apply: clientRequestApplyTrap('http')
    });
    // @ts-ignore
    http.get = new Proxy(http.get, { apply: clientRequestApplyTrap('http') });
    // @ts-ignore
    https.request = new Proxy(https.request, {
      apply: clientRequestApplyTrap('https')
    });
    // @ts-ignore
    https.get = new Proxy(https.get, {
      apply: clientRequestApplyTrap('https')
    });
  }

  clientRequestListeners.add(fn);
  return restoreClientRequest.bind(null, fn);
}

/**
 * Restore unproxied client request behaviour
 *
 * @param { InterceptClientRequestCallback } fn
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
 * Create client request Proxy apply trap for 'protocol'
 *
 * @param { string } protocol
 * @returns { (target: object, ctx: object, args: [string | ClientRequestArgs]) => Res }
 */
function clientRequestApplyTrap(protocol) {
  return function apply(target, ctx, args) {
    const url = new URL(
      typeof args[0] === 'string'
        ? args[0]
        : getHrefFromRequestOptions(args[0], protocol)
    );

    // TODO: pass method/headers
    if (notifyListeners(clientRequestListeners, url) === false) {
      return;
    }

    if (isLocalhost(url.hostname)) {
      // Force to http
      url.protocol = 'http:';
      target =
        target === originalHttpsGet || target === originalHttpGet
          ? originalHttpGet
          : originalHttpRequest;
    }
    if (typeof args[0] === 'string') {
      args[0] = url.href;
    } else {
      args[0].protocol = url.protocol;
      args[0].host = url.host;
      args[0].hostname = url.hostname;
      args[0].port = url.port;
      args[0].path = `${url.href.replace(url.origin, '')}`;
      args[0].href = url.href;
      // Force http agent when localhost (due to mocking most likely)
      if (
        args[0].agent &&
        args[0].agent instanceof http.Agent &&
        // @ts-ignore
        args[0].agent.protocol === 'https:' &&
        isLocalhost(url.hostname)
      ) {
        // @ts-ignore
        args[0].agent = new http.Agent(args[0].agent.options || {});
      }
    }

    // @ts-ignore
    return Reflect.apply(target, ctx, args);
  };
}

/**
 * Retrieve href from 'options'
 *
 * @param { ClientRequestArgs } options
 * @param { string } protocol
 * @returns { string }
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
 * Listen for process event registration
 *
 * @param { InterceptProcessOnCallback } fn
 * @returns { () => void }
 */
function interceptProcessOn(fn) {
  if (!isProxy(process.on)) {
    process.on = new Proxy(process.on, {
      apply: (target, ctx, args) => {
        if (notifyListeners(processOnListeners, ...args) === false) {
          return;
        }
        return Reflect.apply(target, ctx, args);
      }
    });
  }

  processOnListeners.add(fn);
  return restoreProcessOn.bind(null, fn);
}

/**
 * Restore unproxied process event registration
 *
 * @param { InterceptProcessOnCallback } fn
 */
function restoreProcessOn(fn) {
  processOnListeners.delete(fn);
  if (!processOnListeners.size) {
    process.on = originalProcessOn;
  }
}

/**
 * Notify 'listeners' with 'args'
 *
 * @param { Set<InterceptClientRequestCallback | InterceptFileReadCallback | InterceptProcessOnCallback> } listeners
 * @param { ...unknown } args
 */
function notifyListeners(listeners, ...args) {
  for (const listener of listeners) {
    // @ts-ignore
    if (listener(...args) === false) {
      return false;
    }
  }
}
