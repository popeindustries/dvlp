import { parentPort, workerData } from 'worker_threads';
import http from 'http';
import { interceptFileRead } from '../utils/intercept.js';
import { isNodeModuleFilePath } from '../utils/is.js';
import { syncBuiltinESMExports } from 'module';

const serverPort = /** @type { number } */ (workerData);
/** @type { import('worker_threads').MessagePort }*/
let messagePort;
/** @type { import('http').Server } */
let server;

// @ts-ignore
parentPort.once('message', (msg) => {
  messagePort = msg.port;
  messagePort.on('message', handleMessage);
  messagePort.postMessage({ type: 'registered' });
});

// Intercept server creation to get instance with random port
http.createServer = new Proxy(http.createServer, {
  apply(target, ctx, args) {
    server = Reflect.apply(target, ctx, args);

    server.on('error', (err) => {
      throw err;
    });
    server.on('listening', notifyOnStart);
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

/**
 * Handle incoming message
 *
 * @param { ApplicationHostMessage } msg
 */
async function handleMessage(msg) {
  if (msg.type === 'start') {
    /* eslint no-useless-catch: 0 */
    try {
      await import(msg.main);
    } catch (err) {
      throw err;
    }
  }
}

function notifyOnStart() {
  messagePort.postMessage({ type: 'started' });
}
