import http from 'node:http';
import https from 'node:https';
import type { InterceptClientRequestCallback } from './types.ts';
import { isLocalhost } from './is.ts';
import type { RequestOptions } from 'node:http';
import type { Res } from '../types.ts';
import { syncBuiltinESMExports } from 'node:module';
import util from 'node:util';

const clientRequestListeners = new Set<InterceptClientRequestCallback>();
const originalFetch = globalThis.fetch;
const originalHttpRequest = http.request;
const originalHttpGet = http.get;
const originalHttpsRequest = https.request;
const originalHttpsGet = https.get;

// Early init to ensure that all references are proxied
initInterceptClientRequest();

/**
 * Listen for client requests
 */
export function interceptClientRequest(
  fn: InterceptClientRequestCallback,
): () => void {
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
      // @ts-expect-error - patch
      globalThis.fetch = new Proxy(globalThis.fetch, {
        apply: fetchApplyTrap(),
      });
    }
    // @ts-expect-error - patch
    http.request = new Proxy(http.request, {
      apply: clientRequestApplyTrap('http'),
    });
    // @ts-expect-error - patch
    http.get = new Proxy(http.get, { apply: clientRequestApplyTrap('http') });
    // @ts-expect-error - patch
    https.request = new Proxy(https.request, {
      apply: clientRequestApplyTrap('https'),
    });
    // @ts-expect-error - patch
    https.get = new Proxy(https.get, {
      apply: clientRequestApplyTrap('https'),
    });

    syncBuiltinESMExports();
  }
}

/**
 * Restore unproxied client request behaviour
 */
function restoreClientRequest(fn: InterceptClientRequestCallback) {
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
 */
function fetchApplyTrap(): (
  target: object,
  ctx: object,
  args: [URL | RequestInfo, RequestInit | undefined],
) => Promise<Response> {
  return function apply(target, ctx, args) {
    if (clientRequestListeners.size > 0) {
      const [resource, options] = args;
      let url: URL;
      let requestInit: RequestInit | undefined;

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

    // @ts-expect-error - Proxy
    return Reflect.apply(target, ctx, args);
  };
}

/**
 * Create client request Proxy apply trap for 'protocol'
 */
function clientRequestApplyTrap(
  protocol: string,
): (
  target: object,
  ctx: object,
  args:
    | [RequestOptions | string | URL, Function?]
    | [string | URL, RequestOptions, Function?],
) => Res | undefined {
  return function apply(target, ctx, args) {
    if (clientRequestListeners.size > 0) {
      let [urlOrOptions, optionsOrCallback, callback] = args;
      let url: URL;
      let options: RequestOptions;

      if (typeof urlOrOptions === 'string' || urlOrOptions instanceof URL) {
        url = new URL(urlOrOptions);
        options = optionsOrCallback as RequestOptions;
      } else {
        url = new URL(getHrefFromRequestOptions(urlOrOptions, protocol));
        callback = optionsOrCallback as Function;
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
        // @ts-expect-error - non-null
        options.href = url.href;
        // Force http agent when localhost (due to mocking most likely)
        if (
          options.agent &&
          options.agent instanceof http.Agent &&
          // @ts-expect-error - non-null
          options.agent.protocol === 'https:' &&
          isLocalhost(url.hostname)
        ) {
          // @ts-expect-error - non-null
          options.agent = new http.Agent(options.agent.options || {});
        }
      }

      args = [url, options, callback];
    }

    // @ts-expect-error - Proxy
    return Reflect.apply(target, ctx, args);
  };
}

/**
 * Retrieve href from 'options'
 */
function getHrefFromRequestOptions(
  options: RequestOptions & { href?: string },
  protocol: string,
): string {
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
 */
function notifyListeners(
  listeners: Set<InterceptClientRequestCallback>,
  url: URL,
) {
  let modified = false;

  for (const listener of listeners) {
    if (listener(url) === true) {
      modified = true;
    }
  }

  return modified;
}
