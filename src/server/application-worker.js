import { interceptClientRequest, interceptFileRead } from '../utils/intercept.js';
import http from 'http';
import { isEqualSearchParams } from '../utils/url.js';
import { isNodeModuleFilePath } from '../utils/is.js';
import { syncBuiltinESMExports } from 'module';
import { workerData } from 'worker_threads';

const gatewayUrl = /** @type { URL } */ (new URL(workerData.gatewayOrigin));
const serverPort = /** @type { number } */ (workerData.serverPort);
const mocks = /** @type { Array<DeserializedMock> } */ (workerData.serializedMocks)?.map((mockData) => {
  mockData.originRegex = new RegExp(mockData.originRegex);
  mockData.pathRegex = new RegExp(mockData.pathRegex);
  mockData.search = new URLSearchParams(mockData.search);
  return mockData;
});
const messagePort = /** @type { import('worker_threads').MessagePort } */ (workerData.messagePort);
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
        // Override port
        if (typeof args[0] === 'object') {
          args[0].port = serverPort;
        } else {
          args[0] = serverPort;
        }

        return Reflect.apply(target, ctx, args);
      },
    });

    return server;
  },
});

interceptFileRead((filePath) => {
  if (!isNodeModuleFilePath(filePath)) {
    messagePort.postMessage({ type: 'read', path: filePath });
  }
});

interceptClientRequest((url) => {
  for (const mock of mocks) {
    if (
      !mock.originRegex.test(url.origin) ||
      (!mock.ignoreSearch && mock.search && !isEqualSearchParams(url.searchParams, mock.search))
    ) {
      continue;
    }

    if (mock.pathRegex.exec(url.pathname) != null) {
      const href = url.href;
      url.host = gatewayUrl.host;
      url.search = `?dvlpmock=${encodeURIComponent(href)}`;
      break;
    }
  }
  return true;
});

// Update live bindings to ensure that named exports get proxied versions
syncBuiltinESMExports();
