import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import util from 'node:util';

/** @type { Set<InterceptCreateServerCallback> } */
const createServerListeners = new Set();
const originalHttpCreateServer = http.createServer;
const originalHttp2CreateSecureServer = http2.createSecureServer;
const originalHttpsCreateServer = https.createServer;

/**
 * Listen for created servers
 *
 * @param { number } reservedPort
 * @param { InterceptCreateServerCallback } fn
 * @returns { () => void }
 */
export function interceptCreateServer(reservedPort, fn) {
  createServerListeners.add(fn);
  initInterceptCreateServer(reservedPort);
  return restoreCreateServer.bind(null, fn);
}

/**
 * Initialise `http.createServer` proxy
 *
 * @param { number } reservedPort
 */
function initInterceptCreateServer(reservedPort) {
  // TODO: forward https/http2 to unsecure http?
  if (!util.types.isProxy(http.createServer)) {
    for (const [lib, method] of [
      [http, 'createServer'],
      [http2, 'createSecureServer'],
      [https, 'createServer'],
    ]) {
      // @ts-ignore
      lib[method] = new Proxy(lib[method], {
        apply(target, ctx, args) {
          /** @type { import('http').Server } */
          const server = Reflect.apply(target, ctx, args);

          server.on('error', (err) => {
            throw err;
          });
          server.on('listening', () => {
            const protocol = lib === http ? 'http' : 'https';
            const { port } = /** @type { import('net').AddressInfo } */ (
              server.address()
            );
            const origin = `${protocol}://localhost:${port}`;

            for (const listener of createServerListeners) {
              listener(origin);
            }
          });
          server.listen = new Proxy(server.listen, {
            // Randomize port if same as reserved
            apply(target, ctx, args) {
              // listen(options)
              if (typeof args[0] === 'object') {
                if (args[0].port === reservedPort) {
                  args[0].port = 0;
                }
              }
              // listen(port[, host])
              else if (typeof args[0] === 'number') {
                if (args[0] === reservedPort) {
                  args[0] = 0;
                }
              }

              return Reflect.apply(target, ctx, args);
            },
          });

          return server;
        },
      });
    }

    syncBuiltinESMExports();
  }
}

/**
 * Restore unproxied create server behaviour
 *
 * @param { InterceptCreateServerCallback } fn
 */
function restoreCreateServer(fn) {
  createServerListeners.delete(fn);
  if (!createServerListeners.size) {
    http.createServer = originalHttpCreateServer;
    http2.createSecureServer = originalHttp2CreateSecureServer;
    https.createServer = originalHttpsCreateServer;
    syncBuiltinESMExports();
  }
}
