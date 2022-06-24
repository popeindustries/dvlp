import http from 'node:http';
import { interceptClientRequest } from '../utils/intercept.js';
import { isEqualSearchParams } from '../utils/url.js';
import { syncBuiltinESMExports } from 'node:module';
import { workerData } from 'node:worker_threads';

const hostUrl = /** @type { URL } */ (new URL(workerData.hostOrigin));
const serverPort = /** @type { number } */ (workerData.serverPort);
const mocks = /** @type { Array<DeserializedMock> } */ (workerData.serializedMocks)?.map((mockData) => {
  mockData.originRegex = new RegExp(mockData.originRegex);
  mockData.pathRegex = new RegExp(mockData.pathRegex);
  mockData.search = new URLSearchParams(mockData.search);
  return mockData;
});
const messagePort = /** @type { import('worker_threads').MessagePort } */ (workerData.messagePort);
const originalCreateServer = http.createServer;
/** @type { import('http').Server } */
let server;

messagePort.on(
  'message',
  /** @param { ApplicationHostMessage } msg */
  async (msg) => {
    if (msg.type === 'start') {
      /* eslint no-useless-catch: 0 */
      try {
        await import(msg.main);
        // @ts-ignore
        messagePort.postMessage({ type: 'watch', paths: Array.from(global.sources) });
      } catch (err) {
        throw err;
      }
    }
  },
);

// Intercept server creation to override port
http.createServer = new Proxy(http.createServer, {
  apply(target, ctx, args) {
    server = Reflect.apply(target, ctx, args);

    server.on('error', (err) => {
      throw err;
    });
    server.on('listening', () => {
      messagePort.postMessage({ type: 'started' });
    });
    server.listen = new Proxy(server.listen, {
      apply(target, ctx, args) {
        // Override port and host
        // listen(options)
        if (typeof args[0] === 'object') {
          args[0].port = serverPort;
          args[0].host = 'localhost';
        } else {
          // listen(port[, host])
          if (typeof args[0] === 'number') {
            args[0] = serverPort;
            if (typeof args[1] === 'string') {
              args[1] = 'localhost';
            }
            // listen(path)
          } else {
            args = [serverPort, 'localhost', ...args.slice(1)];
          }
        }

        return Reflect.apply(target, ctx, args);
      },
    });

    // Un-proxy in case more than one server created
    // (assumes first server is application server)
    http.createServer = originalCreateServer;
    syncBuiltinESMExports();

    return server;
  },
});

// Redirect mocked request to host
interceptClientRequest((url) => {
  if (mocks) {
    for (const mock of mocks) {
      if (
        !mock.originRegex.test(url.origin) ||
        (!mock.ignoreSearch && mock.search && !isEqualSearchParams(url.searchParams, mock.search))
      ) {
        continue;
      }

      if (mock.pathRegex.exec(url.pathname) != null) {
        const href = url.href;
        url.host = hostUrl.host;
        url.search = `?dvlpmock=${encodeURIComponent(href)}`;
        break;
      }
    }
  }

  return true;
});

// Update live bindings to ensure that named exports get proxied versions
syncBuiltinESMExports();
