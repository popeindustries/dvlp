import http from 'http';
import { parentPort } from 'worker_threads';
// import { proxyBodyWrite } from '../utils/patch-body-write.js';
// import { Socket } from 'net';

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
  } else {
    console.log(serverPort, msg.href);
    // const { href } = msg;
    // const req = new http.IncomingMessage(new Socket());
    // req.url = href;
    // const res = /** @type { Res } */ (new http.ServerResponse(req));

    // proxyBodyWrite(res, (body) => {
    //   console.log(body);
    //   messagePort.postMessage({ type: 'handled', body, href });
    //   return body;
    // });

    // server.emit('request', req, res);
  }
}

function notifyOnStart() {
  messagePort.postMessage({ type: 'started' });
}

/**
 * @param { Error } error
 */
function notifyOnError(error) {
  messagePort.postMessage({ type: 'error', error });
}
