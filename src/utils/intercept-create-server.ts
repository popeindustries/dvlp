import type { AddressInfo } from 'node:net';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import type { InterceptCreateServerCallback } from './types.ts';
import type { Server } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import util from 'node:util';

const createServerListeners = new Set<InterceptCreateServerCallback>();
const originalHttpCreateServer = http.createServer;
const originalHttp2CreateSecureServer = http2.createSecureServer;
const originalHttpsCreateServer = https.createServer;

/**
 * Listen for created servers
 */
export function interceptCreateServer(
  reservedPort: number,
  fn: InterceptCreateServerCallback,
): () => void {
  createServerListeners.add(fn);
  initInterceptCreateServer(reservedPort);
  return restoreCreateServer.bind(null, fn);
}

/**
 * Initialise `http.createServer` proxy
 */
function initInterceptCreateServer(reservedPort: number) {
  if (!util.types.isProxy(http.createServer)) {
    for (const [lib, method] of [
      [http, 'createServer'],
      [http2, 'createSecureServer'],
      [https, 'createServer'],
    ]) {
      // @ts-expect-error - patch
      lib[method] = new Proxy(lib[method], {
        apply(target, ctx, args) {
          const server: Server = Reflect.apply(target, ctx, args);

          server.on('error', (err) => {
            throw err;
          });
          server.once('listening', () => {
            const protocol = lib === http ? 'http' : 'https';
            const { port } = server.address() as AddressInfo;
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
              // listen('localhost:port')
              else if (typeof args[0] === 'string') {
                const [, port] = args[0].split(':');
                if (Number(port) === reservedPort) {
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
 */
function restoreCreateServer(fn: InterceptCreateServerCallback) {
  createServerListeners.delete(fn);
  if (!createServerListeners.size) {
    http.createServer = originalHttpCreateServer;
    http2.createSecureServer = originalHttp2CreateSecureServer;
    https.createServer = originalHttpsCreateServer;
    syncBuiltinESMExports();
  }
}
