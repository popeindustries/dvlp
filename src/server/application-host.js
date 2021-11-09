import { dirname, join } from 'path';
import { fatal, info } from '../utils/log.js';
import { MessageChannel, SHARE_ENV, Worker } from 'worker_threads';
import Debug from 'debug';
import { fileURLToPath } from 'url';
import { request } from 'http';
import watch from '../utils/watch.js';

const debug = Debug('dvlp:apphost');
const workerPath = join(dirname(fileURLToPath(import.meta.url)), './application-worker.js');
let id = 0;

export default class ApplicationHost {
  /**
   * @param { string | (() => void) } main
   * @param { (filePath: string) => void } [triggerClientReload]
   */
  constructor(main, triggerClientReload) {
    this.main = main;
    /** @type { Watcher | undefined } */
    this.watcher;

    if (triggerClientReload !== undefined) {
      this.watcher = watch(async (filePath) => {
        await this.restart();
        triggerClientReload(filePath);
      });
    }

    if (typeof this.main === 'string') {
      if (this.watcher !== undefined) {
        this.watcher.add(this.main);
      }
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
      // this.main();
      return;
    }

    try {
      await this.activeThread.start(this.main);
      info(`application server started on port "${this.activeThread.serverPort}"`);
      return;
    } catch (err) {
      await this.activeThread.terminate();
      this.activeThread = this.pendingThread;
      this.pendingThread = this.createThread();

      fatal(err);
    }
  }

  /**
   * Restart application
   */
  async restart() {
    await this.activeThread.terminate();
    this.activeThread = this.pendingThread;
    this.pendingThread = this.createThread();
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

    const headers = { ...req.headers };
    delete headers[''];
    delete headers.host;
    headers.connection = 'keep-alive';

    const requestOptions = {
      headers,
      method: req.method,
      path: req.url,
      port: this.activeThread.serverPort,
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
    const thread = new ApplicationThread(workerPath, this.watcher, {
      env: SHARE_ENV,
      execArgv: ['--enable-source-maps', '--no-warnings'],
    });

    return thread;
  }

  /**
   * Destroy instance
   */
  destroy() {}
}

class ApplicationThread extends Worker {
  /**
   * @param { string } filePath
   * @param { Watcher | undefined } watcher
   * @param { import('worker_threads').WorkerOptions } options
   */
  constructor(filePath, watcher, options) {
    super(filePath, options);

    const { port1, port2 } = new MessageChannel();

    this.id = ++id;
    /** @type { import('worker_threads').MessagePort }*/
    this.messagePort = port1;
    this.serverPort = 0;
    this.watcher = watcher;
    this.handleMessage = this.handleMessage.bind(this);
    /**
     * Wait for worker to receive private port
     * @type { Promise<void> }
     */
    this.registered = new Promise((resolve, reject) => {
      this.messagePort.once(
        'message',
        /** @type { ApplicationWorkerMessage } */
        (msg) => {
          if (msg.type === 'registered') {
            resolve();
          }
          this.messagePort.on('message', this.handleMessage);
        },
      );
    });
    /** @type { (value?: void | PromiseLike<void>) => void | undefined } */
    this.resolveStarted;
    /** @type { (value?: unknown) => void | undefined } */
    this.rejectStarted;

    // Send receiving port to worker over global parentPort
    this.postMessage({ port: port2 }, [port2]);

    debug(`created application thread with id "${this.id}"`);
  }

  /**
   * @param { string } main
   * @returns { Promise<void>}
   */
  start(main) {
    return new Promise((resolve, reject) => {
      this.resolveStarted = resolve;
      this.rejectStarted = reject;
      this.registered.then(() => {
        this.messagePort.postMessage({ type: 'start', main });
      });
    });
  }

  /**
   * @param { ApplicationWorkerMessage } msg
   * @private
   */
  handleMessage(msg) {
    console.log(Date.now(), this.id, msg);
    switch (msg.type) {
      case 'started': {
        if (this.resolveStarted !== undefined) {
          this.resolveStarted();
        }
        this.serverPort = msg.port;
        break;
      }
      case 'read': {
        if (this.watcher !== undefined) {
          this.watcher.add(msg.path);
        }
        break;
      }
      case 'errored': {
        if (this.rejectStarted !== undefined) {
          this.rejectStarted(msg.error);
        }
        break;
      }
    }
  }
}
