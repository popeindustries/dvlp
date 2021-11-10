import { dirname, join } from 'path';
import { fatal, info } from '../utils/log.js';
import { MessageChannel, setEnvironmentData, SHARE_ENV, Worker } from 'worker_threads';
import config from '../config.js';
import Debug from 'debug';
import { fileURLToPath } from 'url';
import { request } from 'http';
import watch from '../utils/watch.js';

const debug = Debug('dvlp:apphost');
const workerPath = join(dirname(fileURLToPath(import.meta.url)), './application-worker.js');

export default class ApplicationHost {
  /**
   * @param { string | (() => void) } main
   * @param { number } port
   * @param { (filePath: string) => void } [triggerClientReload]
   */
  constructor(main, port, triggerClientReload) {
    this.main = main;
    this.port = port;
    /** @type { Watcher | undefined } */
    this.watcher;

    if (triggerClientReload !== undefined) {
      this.watcher = watch(async (filePath) => {
        await this.restart();
        triggerClientReload(filePath);
      });
    }

    if (typeof this.main === 'string') {
      setEnvironmentData('port', port);
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
      info(`application server started on port "${this.port}"`);
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

    if (!this.activeThread.isListening) {
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
    return new ApplicationThread(workerPath, this.watcher, {
      env: SHARE_ENV,
      execArgv: ['--enable-source-maps', '--no-warnings', '--experimental-loader', config.applicationLoaderPath],
    });
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.activeThread.terminate();
    this.pendingThread.terminate();
    this.watcher?.close();
  }
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

    /** @type { boolean } */
    this.isListening;
    /** @type { import('worker_threads').MessagePort }*/
    this.messagePort = port1;
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
    /** @type { ((value?: void | PromiseLike<void>) => void) | undefined } */
    this.resolveStarted;
    /** @type { ((value?: unknown) => void) | undefined } */
    this.rejectStarted;

    this.on('error', (err) => {
      if (this.isListening === undefined) {
        this.listen(err);
      }
      console.log(err);
      fatal(err);
    });
    this.on('exit', (exitCode) => {
      this.messagePort.close();
      // @ts-ignore
      this.messagePort = undefined;
      this.watcher = undefined;
    });

    // Send receiving port to worker over global parentPort
    this.postMessage({ port: port2 }, [port2]);

    debug(`created application thread with id "${this.threadId}"`);
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
    switch (msg.type) {
      case 'started': {
        this.listen();
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
  listen(err) {
    if (err) {
      if (this.rejectStarted !== undefined) {
        this.rejectStarted(err);
      }
      this.isListening = false;
    } else {
      if (this.resolveStarted !== undefined) {
        this.resolveStarted();
      }
      this.isListening = true;
    }

    this.resolveStarted = this.rejectStarted = undefined;
  }
}
