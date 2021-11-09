import http from 'http';
import { interceptFileRead } from '../utils/intercept.js';
import { isNodeModuleFilePath } from '../utils/is.js';
import { parentPort } from 'worker_threads';

/** @type { import('worker_threads').MessagePort }*/
let messagePort;
/** @type { import('http').Server } */
let server;
/** @type { number } */
let serverPort;

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
      notifyOnError(err);
    });
    server.on('listening', () => {
      const address = server.address();

      if (address !== null && typeof address === 'object') {
        serverPort = address.port;
        notifyOnStart();
      } else {
        notifyOnError(Error('unable to start application server on random port'));
      }
    });
    server.listen = new Proxy(server.listen, {
      apply(target, ctx, args) {
        // Assign random port
        if (typeof args[0] === 'number') {
          args[0] = 0;
        } else if (typeof args[0] === 'object') {
          args[0].port = 0;
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

/**
 * Handle incoming message
 *
 * @param { ApplicationHostMessage } msg
 */
async function handleMessage(msg) {
  if (msg.type === 'start') {
    try {
      await import(msg.main);
    } catch (err) {
      notifyOnError(/** @type { Error } */ (err));
    }
  }
}

function notifyOnStart() {
  messagePort.postMessage({ type: 'started', port: serverPort });
}

/**
 * @param { Error } error
 */
function notifyOnError(error) {
  messagePort.postMessage({ type: 'errored', error });
}
