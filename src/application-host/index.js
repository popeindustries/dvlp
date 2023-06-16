import { dirname, join } from 'node:path';
import { error, fatal, noisyInfo } from '../utils/log.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, msDiff } from '../utils/metrics.js';
import { MessageChannel, SHARE_ENV, Worker } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import config from '../config.js';
import Debug from 'debug';
import { forwardRequest } from '../utils/request.js';
import { getDependencies } from '../utils/module.js';
import { getProjectPath } from '../utils/file.js';
import { performance } from 'node:perf_hooks';
import { watch } from '../utils/watch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const debug = Debug('dvlp:apphost');
const workerPath = join(__dirname, './application-worker.js');

/**
 * Create application loader based on passed hooks
 *
 * @param { import('url').URL } filePath
 * @param { { hooks?: Hooks, hooksPath?: string } } hooksConfig
 */
export function createApplicationLoaderFile(filePath, hooksConfig) {
  const hooksPath =
    hooksConfig.hooks &&
    (hooksConfig.hooks.onServerTransform || hooksConfig.hooks.onServerResolve)
      ? hooksConfig.hooksPath
      : undefined;
  const contents =
    (hooksPath
      ? `import customHooks from '${hooksPath}';\n`
      : 'const customHooks = {};\n') +
    readFileSync(join(__dirname, 'application-loader.js'), 'utf-8');

  writeFileSync(filePath, contents);
}

export class ApplicationHost {
  /**
   * @param { string  } main
   * @param { string } hostOrigin
   * @param { (filePath: string, silent?: boolean) => void } [triggerClientReload]
   * @param { Array<SerializedMock> } [serializedMocks]
   * @param { Array<string> } [argv]
   */
  constructor(main, hostOrigin, triggerClientReload, serializedMocks, argv) {
    /** @type { string } */
    this.appOrigin;

    this.argv = argv;
    this.hostOrigin = hostOrigin;
    this.main = pathToFileURL(main).href;
    this.serializedMocks = serializedMocks;
    /** @type { ApplicationThread } */
    this.activeThread = this.createThread();
    /** @type { ApplicationThread } */
    this.pendingThread = this.createThread();
    /** @type { Watcher | undefined } */
    this.watcher;

    if (triggerClientReload !== undefined) {
      this.watcher = watch(async (filePath) => {
        noisyInfo(
          `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.cyan(
            getProjectPath(filePath),
          )}`,
        );
        await this.restart();
      });

      getDependencies(this.main, 'node').then((dependencies) =>
        this.watcher?.add(dependencies),
      );
    }
  }

  /**
   * Start application
   *
   * @returns { Promise<void> }
   */
  async start() {
    try {
      /** @type { [start: number, stop: number ]} */
      const times = [performance.now(), 0];

      this.appOrigin = await this.activeThread.start(this.main);

      times[1] = performance.now();
      const duration = msDiff(times);

      noisyInfo(`${format(duration)} application server started`);
    } catch (err) {
      error(err);
    }
  }

  /**
   * Restart application
   */
  async restart() {
    debug(`terminating thread with id "${this.activeThread.threadId}"`);
    await this.activeThread.terminate();
    this.activeThread = this.pendingThread;
    this.pendingThread = this.createThread();
    noisyInfo('\n  restarting application server...');
    await this.start();
  }

  /**
   * Handle application request.
   * Pipe incoming request to application running in active thread.
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

    forwardRequest(this.appOrigin, req, res);
  }

  /**
   * @private
   */
  createThread() {
    const { port1, port2 } = new MessageChannel();
    const thread = new ApplicationThread(workerPath, port1, this.watcher, {
      argv: this.argv,
      env: SHARE_ENV,
      // @ts-ignore
      execArgv: [
        '--enable-source-maps',
        '--no-warnings',
        '--experimental-loader',
        config.applicationLoaderURL.href,
      ],
      stderr: true,
      workerData: {
        hostOrigin: this.hostOrigin,
        messagePort: port2,
        serializedMocks: this.serializedMocks,
      },
      transferList: [port2],
    });

    return thread;
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.activeThread?.terminate();
    this.pendingThread?.terminate();
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
    /** @type { ((value: string | PromiseLike<string>) => void) | undefined } */
    this.resolveStarted;
    /** @type { ((value?: unknown) => void) | undefined } */
    this.rejectStarted;

    this.messagePort.on(
      'message',
      /** @param { ApplicationWorkerMessage} msg */
      (msg) => {
        if (msg.type === 'listening') {
          this.isListening = true;
          this.resolveStarted?.(msg.origin);
        }
      },
    );
    this.on('error', (err) => {
      if (this.isListening === undefined) {
        this.isListening = false;
        this.rejectStarted?.(err);
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
    this.stderr.on('data', (chunk) => {
      error(chunk.toString().trimEnd());
    });

    debug(
      `created application thread with id "${this.threadId}" at "${filePath}"`,
    );
  }

  /**
   * @param { string } main
   * @returns { Promise<string>}
   */
  start(main) {
    return new Promise(async (resolve, reject) => {
      this.resolveStarted = resolve;
      this.rejectStarted = reject;

      debug(`starting application at ${main}`);

      this.messagePort.postMessage({ type: 'start', main });
    });
  }
}
