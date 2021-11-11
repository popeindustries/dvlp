import { dirname, join, relative } from 'path';
import { fatal, noisyInfo } from '../utils/log.js';
import { MessageChannel, SHARE_ENV, Worker } from 'worker_threads';
import chalk from 'chalk';
import config from '../config.js';
import Debug from 'debug';
import { fileURLToPath } from 'url';
import { getProjectPath } from '../utils/file.js';
import http from 'http';
import { isProxy } from '../utils/is.js';
import { pathToFileURL } from 'url';
import { request } from 'http';
import watch from '../utils/watch.js';

const debug = Debug('dvlp:apphost');
let workerPath = relative(
  process.cwd(),
  join(dirname(fileURLToPath(import.meta.url)), './application-worker.js'),
).replace(/\\/g, '/');

if (!workerPath.startsWith('.')) {
  workerPath = `./${workerPath}`;
}

export default class ApplicationHost {
  /**
   * @param { string | (() => void) } main
   * @param { number } port
   * @param { (filePath: string, silent?: boolean) => void } [triggerClientReload]
   */
  constructor(main, port, triggerClientReload) {
    this.main = main;
    this.port = port;
    /** @type { import('http').Server | undefined } */
    this.server;
    /** @type { Watcher | undefined } */
    this.watcher;

    if (triggerClientReload !== undefined) {
      this.watcher = watch(async (filePath) => {
        noisyInfo(`\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.cyan(getProjectPath(filePath))}`);
        await this.restart();
        triggerClientReload(filePath, true);
      });
    }

    if (typeof this.main === 'string') {
      if (this.watcher !== undefined) {
        this.watcher.add(this.main);
      }
      this.main = pathToFileURL(this.main).href;
      /** @type { ApplicationThread } */
      this.activeThread = this.createThread();
      /** @type { ApplicationThread } */
      this.pendingThread = this.createThread();
    }
  }

  /**
   * Start application
   *
   * @returns { Promise<void> }
   */
  async start() {
    if (typeof this.main === 'function') {
      proxyCreateServer(this);
      this.main();
      return;
    }

    try {
      const s = Date.now();

      await this.activeThread.start(this.main);
      debug(`application server started in ${Date.now() - s}ms`);
      noisyInfo(`    proxied application server started at ${chalk.bold(`http://localhost:${this.port}`)}`);
    } catch (err) {
      // Skip. Unable to recover until file save and restart
    }
  }

  /**
   * Restart application
   */
  async restart() {
    if (this.activeThread.isListening) {
      debug(`terminating thread with id "${this.activeThread.threadId}"`);
      await this.activeThread.terminate();
    }
    this.activeThread = this.pendingThread;
    this.pendingThread = this.createThread();
    noisyInfo('    restarting application server...');
    await this.start();
  }

  /**
   * Handle application request
   *
   * @param { Req } req
   * @param { Res } res
   */
  handle(req, res) {
    debug(`handling request for "${req.url}"`);

    if (this.activeThread !== undefined && !this.activeThread.isListening) {
      res.writeHead(500);
      res.end('application server failed to start');
      return;
    }

    const headers = { ...req.headers };
    delete headers[''];
    delete headers.host;
    headers.connection = 'keep-alive';
    const requestOptions = {
      headers,
      method: req.method,
      path: req.url,
      port: this.port,
    };
    const appRequest = request(requestOptions, (originResponse) => {
      const { statusCode, headers } = originResponse;
      res.writeHead(statusCode || 200, headers);
      originResponse.pipe(res);
    });

    appRequest.on('error', (err) => {
      res.writeHead(500);
      res.end(err.message);
    });

    req.pipe(appRequest);
  }

  /**
   * @private
   */
  createThread() {
    const { port1, port2 } = new MessageChannel();

    return new ApplicationThread(workerPath, port1, this.watcher, {
      env: SHARE_ENV,
      // @ts-ignore
      execArgv: ['--enable-source-maps', '--no-warnings', '--experimental-loader', config.applicationLoaderPath],
      workerData: { serverPort: this.port, messagePort: port2 },
      transferList: [port2],
    });
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.activeThread?.terminate();
    this.pendingThread?.terminate();
    this.server?.destroy();
    this.watcher?.close();
  }
}

class ApplicationThread extends Worker {
  /**
   * @param { string } filePath
   * @param { import('worker_threads').MessagePort } messagePort
   * @param { Watcher | undefined } watcher
   * @param { import('worker_threads').WorkerOptions } options
   */
  constructor(filePath, messagePort, watcher, options) {
    super(filePath, options);

    /** @type { boolean } */
    this.isListening;
    this.isRegistered = false;
    this.messagePort = messagePort;
    this.watcher = watcher;
    /** @type { ((value?: void | PromiseLike<void>) => void) | undefined } */
    this.resolveStarted;
    /** @type { ((value?: unknown) => void) | undefined } */
    this.rejectStarted;

    this.messagePort.on('message', this.handleMessage.bind(this));

    this.on('error', (err) => {
      if (this.isListening === undefined) {
        this.listening(err);
      }
      fatal(err);
    });
    this.on('exit', (exitCode) => {
      this.messagePort.removeAllListeners();
      this.messagePort.close();
      // @ts-ignore
      this.messagePort = undefined;
      this.watcher = undefined;
    });

    debug(`created application thread with id "${this.threadId}" at "${filePath}"`);
  }

  /**
   * @param { string } main
   * @returns { Promise<void>}
   */
  start(main) {
    return new Promise((resolve, reject) => {
      this.resolveStarted = resolve;
      this.rejectStarted = reject;
      debug(`starting application at ${main}`);
      this.messagePort.postMessage({ type: 'start', main });
    });
  }

  /**
   * @param { ApplicationWorkerMessage } msg
   * @private
   */
  handleMessage(msg) {
    switch (msg.type) {
      case 'started': {
        this.listening();
        break;
      }
      case 'read': {
        if (this.watcher !== undefined) {
          this.watcher.add(msg.path);
        }
        break;
      }
    }
  }

  /**
   * @param { Error } [err]
   * @private
   */
  listening(err) {
    if (err) {
      if (this.rejectStarted !== undefined) {
        this.rejectStarted(err);
      }
    } else {
      if (this.resolveStarted !== undefined) {
        this.resolveStarted();
      }
    }

    this.isListening = err === undefined;
    this.resolveStarted = this.rejectStarted = undefined;
  }
}

/**
 * Intercept server creation
 *
 * @param { ApplicationHost } host
 */
function proxyCreateServer(host) {
  if (!isProxy(http.createServer)) {
    http.createServer = new Proxy(http.createServer, {
      apply(target, ctx, args) {
        /** @type { import('http').Server } */
        const server = Reflect.apply(target, ctx, args);
        const connections = new Map();

        server.on('connection', (connection) => {
          const key = `${connection.remoteAddress}:${connection.remotePort}`;

          connections.set(key, connection);
          connection.on('close', () => {
            connections.delete(key);
          });
        });
        server.on('listening', () => {
          const address = server.address();
          host.port = /** @type { import('net').AddressInfo } */ (address).port;
        });

        server.destroy = () => {
          for (const connection of connections.values()) {
            connection.destroy();
          }
          connections.clear();
          server.close();
        };

        host.server = server;

        return server;
      },
    });
  }
}
