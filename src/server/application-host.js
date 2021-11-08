import { dirname, join } from 'path';
import { MessageChannel, SHARE_ENV, Worker } from 'worker_threads';
import { fileURLToPath } from 'url';

const workerPath = join(dirname(fileURLToPath(import.meta.url)), './application-worker.js');
let id = 0;

export default class ApplicationHost {
  /**
   * @param { string | (() => void) } main
   */
  constructor(main) {
    this.main = main;

    if (typeof this.main === 'string') {
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
      return;
    } catch (err) {
      await this.activeThread.terminate();
      this.activeThread = this.pendingThread;
      this.pendingThread = this.createThread();

      throw err;
    }
  }

  /**
   * Restart application
   */
  async restart() {}

  /**
   * Handle request for "href"
   *
   * @param { string } href
   */
  handle(href) {
    return this.activeThread.handle(href);
  }

  /**
   * @private
   */
  createThread() {
    const thread = new ApplicationThread(workerPath, { env: SHARE_ENV });

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
   * @param { import('worker_threads').WorkerOptions } options
   */
  constructor(filePath, options) {
    super(filePath, options);

    const { port1, port2 } = new MessageChannel();

    this.id = ++id;
    this.port = port1;
    this.handleMessage = this.handleMessage.bind(this);
    /**
     * Wait for worker to receive private port
     * @type { Promise<void> }
     */
    this.registered = new Promise((resolve, reject) => {
      this.port.once(
        'message',
        /** @type { ApplicationWorkerMessage } */
        (msg) => {
          if (msg.type === 'registered') {
            resolve();
          }
          this.port.on('message', this.handleMessage);
        },
      );
    });
    /** @type { (value?: void | PromiseLike<void>) => void | undefined } */
    this.resolveStarted;
    /** @type { (value?: unknown) => void | undefined } */
    this.rejectStarted;
    /** @type { Map<string, ApplicationWorkerPendingHandle> } */
    this.pendingHandlers = new Map();

    // Send receiving port to worker over global parentPort
    this.postMessage({ port: port2 }, [port2]);
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
        this.port.postMessage({ type: 'start', main });
      });
    });
  }

  /**
   * @param { string } href
   * @returns { Promise<{ body: string, href: string}> }
   */
  handle(href) {
    const pending = this.pendingHandlers.get(href);

    if (pending !== undefined) {
      return pending.promise;
    }

    /** @type { ApplicationWorkerPendingHandle } */
    const handler = {};
    const promise = new Promise((resolve, reject) => {
      handler.resolve = resolve;
      handler.reject = reject;
    });
    handler.promise = promise;
    this.port.postMessage({ type: 'handle', href });

    this.pendingHandlers.set(href, handler);

    return promise;
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
        break;
      }
      case 'startedError': {
        if (this.rejectStarted !== undefined) {
          this.rejectStarted(msg.error);
        }
        break;
      }
      case 'handled': {
        const { href } = msg;
        const handler = this.pendingHandlers.get(href);

        if (handler !== undefined) {
          this.pendingHandlers.delete(href);
          handler.resolve(msg);
        }
        break;
      }
      case 'handledError': {
        const { href } = msg.error;
        const handler = this.pendingHandlers.get(href);

        if (handler !== undefined) {
          this.pendingHandlers.delete(href);
          handler.reject(msg.error);
        }
        break;
      }
    }
  }
}
