import { isLocalhost, isProxy } from './is.js';
import fs from 'fs';
import http from 'http';
import https from 'https';

/** @type { Set<InterceptClientRequestCallback> } */
const clientRequestListeners = new Set();
/** @type { Set<InterceptFileReadCallback> } */
const fileReadListeners = new Set();
const originalHttpRequest = http.request;
const originalHttpGet = http.get;
const originalHttpsRequest = https.request;
const originalHttpsGet = https.get;
const originalReadStreamRead = fs.ReadStream.prototype._read;
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

// Early init to ensure that 3rd-party libraries use proxied versions
initInterceptFileRead();

/**
 * Listen for file system reads and report
 *
 * @param { InterceptFileReadCallback } fn
 * @returns { () => void }
 */
export function interceptFileRead(fn) {
  initInterceptFileRead();
  fileReadListeners.add(fn);
  return restoreFileRead.bind(null, fn);
}

/**
 * Initialise `fileRead` proxy
 */
function initInterceptFileRead() {
  if (!isProxy(fs.readFile)) {
    // Proxy ReadStream private method to work around patching by graceful-fs
    const ReadStream = fs.ReadStream.prototype;

    ReadStream._read = new Proxy(ReadStream._read, {
      apply(target, ctx, args) {
        if (notifyListeners(fileReadListeners, ctx.path) === false) {
          return;
        }
        return Reflect.apply(target, ctx, args);
      },
    });

    for (const method of ['readFile', 'readFileSync']) {
      // @ts-ignore
      fs[method] = new Proxy(fs[method], {
        apply(target, ctx, args) {
          if (notifyListeners(fileReadListeners, args[0]) === false) {
            return;
          }
          return Reflect.apply(target, ctx, args);
        },
      });
    }
  }
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
export function interceptClientRequest(fn) {
  initInterceptClientRequest();
  clientRequestListeners.add(fn);
  return restoreClientRequest.bind(null, fn);
}

/**
 * Initialise `http.request` proxy
 */
function initInterceptClientRequest() {
  if (!isProxy(http.request)) {
    // @ts-ignore
    http.request = new Proxy(http.request, {
      apply: clientRequestApplyTrap('http'),
    });
    // @ts-ignore
    http.get = new Proxy(http.get, { apply: clientRequestApplyTrap('http') });
    // @ts-ignore
    https.request = new Proxy(https.request, {
      apply: clientRequestApplyTrap('https'),
    });
    // @ts-ignore
    https.get = new Proxy(https.get, {
      apply: clientRequestApplyTrap('https'),
    });
  }
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
 * @returns { (target: object, ctx: object, args: [import('http').RequestOptions | string | URL, Function?] | [string | URL, import('http').RequestOptions, Function?]) => Res }
 */
function clientRequestApplyTrap(protocol) {
  return function apply(target, ctx, args) {
    if (clientRequestListeners.size > 0) {
      let [urlOrOptions, optionsOrCallback, callback] = args;
      /** @type { import('http').RequestOptions } */
      let options;
      /** @type { URL } */
      let url;

      if (typeof urlOrOptions === 'string' || urlOrOptions instanceof URL) {
        url = new URL(urlOrOptions);
        options = /** @type { import('http').RequestOptions } */ (optionsOrCallback);
      } else {
        url = new URL(getHrefFromRequestOptions(urlOrOptions, protocol));
        callback = /** @type { Function } */ (optionsOrCallback);
        options = urlOrOptions;
      }

      // TODO: pass method/headers
      if (notifyListeners(clientRequestListeners, url) === false) {
        return;
      }

      if (isLocalhost(url.hostname)) {
        // Force to http
        url.protocol = 'http:';
        target = target === originalHttpsGet || target === originalHttpGet ? originalHttpGet : originalHttpRequest;
      }

      options.protocol = url.protocol;
      options.host = url.host;
      options.hostname = url.hostname;
      options.port = url.port;
      options.path = `${url.href.replace(url.origin, '')}`;
      // @ts-ignore
      options.href = url.href;
      // Force http agent when localhost (due to mocking most likely)
      if (
        options.agent &&
        options.agent instanceof http.Agent &&
        // @ts-ignore
        options.agent.protocol === 'https:' &&
        isLocalhost(url.hostname)
      ) {
        // @ts-ignore
        options.agent = new http.Agent(options.agent.options || {});
      }

      args = [url, options, callback];
    }

    // @ts-ignore
    return Reflect.apply(target, ctx, args);
  };
}

/**
 * Retrieve href from 'options'
 *
 * @param { import('http').RequestOptions & { href?: string } } options
 * @param { string } protocol
 * @returns { string }
 */
function getHrefFromRequestOptions(options, protocol) {
  if (options.href) {
    return options.href;
  }
  if (options.host == null) {
    options.host = 'localhost';
  }

  let { host, path, port } = options;

  if (!host.includes(':') && port != null) {
    host += `:${port}`;
  }

  return `${protocol}://${host}${path}`;
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
