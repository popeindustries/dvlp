import http from 'node:http';
import https from 'node:https';
import { isLocalhost } from './is.js';
import { syncBuiltinESMExports } from 'node:module';
import util from 'node:util';

/** @type { Set<InterceptClientRequestCallback> } */
const clientRequestListeners = new Set();
const originalFetch = globalThis.fetch;
const originalHttpRequest = http.request;
const originalHttpGet = http.get;
const originalHttpsRequest = https.request;
const originalHttpsGet = https.get;

// Early init to ensure that all references are proxied
initInterceptClientRequest();

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
  if (!util.types.isProxy(http.request)) {
    if (originalFetch !== undefined) {
      // @ts-ignore
      globalThis.fetch = new Proxy(globalThis.fetch, {
        apply: fetchApplyTrap(),
      });
    }
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

    syncBuiltinESMExports();
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
    globalThis.fetch = originalFetch;
    http.request = originalHttpRequest;
    http.get = originalHttpGet;
    https.request = originalHttpsRequest;
    https.get = originalHttpsGet;
    syncBuiltinESMExports();
  }
}

/**
 * Create `fetch` Proxy apply trap
 *
 * @returns { (target: object, ctx: object, args: [URL | RequestInfo, RequestInit | undefined]) => Promise<Response> }
 */
function fetchApplyTrap() {
  return function apply(target, ctx, args) {
    if (clientRequestListeners.size > 0) {
      const [resource, options] = args;
      /** @type { URL } */
      let url;
      /** @type { RequestInit | undefined } */
      let requestInit;

      if (resource instanceof Request) {
        url = new URL(resource.url);
        requestInit = resource;
      } else {
        url = new URL(resource);
        requestInit = options;
      }

      // Allow listeners to mutate url
      const modified = notifyListeners(clientRequestListeners, url);

      if (modified) {
        args = [url, requestInit];
      }
    }

    // @ts-ignore
    return Reflect.apply(target, ctx, args);
  };
}

/**
 * Create client request Proxy apply trap for 'protocol'
 *
 * @param { string } protocol
 * @returns { (target: object, ctx: object, args: [import('http').RequestOptions | string | URL, Function?] | [string | URL, import('http').RequestOptions, Function?]) => Res | undefined }
 */
function clientRequestApplyTrap(protocol) {
  return function apply(target, ctx, args) {
    if (clientRequestListeners.size > 0) {
      let [urlOrOptions, optionsOrCallback, callback] = args;
      /** @type { URL } */
      let url;
      /** @type { import('http').RequestOptions } */
      let options;

      if (typeof urlOrOptions === 'string' || urlOrOptions instanceof URL) {
        url = new URL(urlOrOptions);
        options = /** @type { import('http').RequestOptions } */ (
          optionsOrCallback
        );
      } else {
        url = new URL(getHrefFromRequestOptions(urlOrOptions, protocol));
        callback = /** @type { Function } */ (optionsOrCallback);
        options = urlOrOptions;
      }

      // Allow listeners to mutate url
      const modified = notifyListeners(clientRequestListeners, url);

      if (modified) {
        target =
          target === originalHttpsGet || target === originalHttpGet
            ? originalHttpGet
            : originalHttpRequest;
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
 * Notify 'listeners' with 'url'
 *
 * @param { Set<InterceptClientRequestCallback > } listeners
 * @param { URL } url
 */
function notifyListeners(listeners, url) {
  let modified = false;

  for (const listener of listeners) {
    if (listener(url) === true) {
      modified = true;
    }
  }

  return modified;
}
