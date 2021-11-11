import http from 'http';
import { interceptFileRead } from '../utils/intercept.js';
import { isNodeModuleFilePath } from '../utils/is.js';
import { syncBuiltinESMExports } from 'module';
import { workerData } from 'worker_threads';

const serverPort = /** @type { number } */ (workerData.serverPort);
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
        console.log(err);
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
        if (typeof args[0] === 'number') {
          args[0] = serverPort;
        } else if (typeof args[0] === 'object') {
          args[0].port = serverPort;
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

// Update live bindings to ensure that named exports get proxied versions
syncBuiltinESMExports();
