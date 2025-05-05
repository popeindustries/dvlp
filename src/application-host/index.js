import { dirname, join } from 'node:path';
import { error, fatal, noisyInfo } from '../utils/log.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, msDiff } from '../utils/metrics.js';
import { MessageChannel, Worker } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import config from '../config.js';
import Debug from 'debug';
import { forwardRequest } from '../utils/request.js';
import { getProjectPath } from '../utils/file.js';
import { needsLegacyLoader } from '../utils/module.js';
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
  const loaderName = needsLegacyLoader()
    ? 'application-loader-legacy.js'
    : 'application-loader.js';
  const hooksPath =
    hooksConfig.hooks &&
    (hooksConfig.hooks.onServerTransform || hooksConfig.hooks.onServerResolve)
      ? hooksConfig.hooksPath
      : undefined;
  const contents =
    (hooksPath
      ? `import customHooks from '${hooksPath}';\n`
      : 'const customHooks = {};\n') +
    readFileSync(join(__dirname, loaderName), 'utf-8');

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
    /** @type { Set<string> } */
    this.appOrigins = new Set();

    this.argv = argv;
    this.hostOrigin = hostOrigin;
    this.main = pathToFileURL(main).href;
    this.serializedMocks = serializedMocks;
    /** @type { ApplicationThread } */
    this.activeThread = this.createThread();
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
    }
  }

  /**
   * Start application
   *
   * @returns { Promise<void> }
   */
  async start() {
    /** @type { [start: number, stop: number ]} */
    const times = [performance.now(), 0];

    debug(`starting thread at ${this.main}`);

    await this.activeThread.start(this.main);

    times[1] = performance.now();
    noisyInfo(`${format(msDiff(times))} application server started`);
  }

  /**
   * Restart application
   */
  async restart() {
    if (this.activeThread !== undefined) {
      debug(`terminating thread with id "${this.activeThread.threadId}"`);

      this.activeThread.removeAllListeners();
      await this.activeThread.terminate();
      this.activeThread = this.createThread();

      noisyInfo('\n  restarting application server...');
      await this.start();
    }
  }

  /**
   * Add "filePaths" to watcher
   *
   * @param { string | Array<string> } filePaths
   */
  addWatchFiles(filePaths) {
    this.watcher?.add(filePaths);
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

    forwardRequest(this.appOrigins, req, res);
  }

  /**
   * @private
   */
  createThread() {
    const { port1, port2 } = new MessageChannel();
    const execArgv = [
      '--enable-source-maps',
      '--disable-warning=ExperimentalWarning',
    ];

    port1.unref();

    if (needsLegacyLoader()) {
      execArgv.push('--experimental-loader', config.applicationLoaderURL.href);
    }

    const thread = new ApplicationThread(workerPath, port1, this.watcher, {
      argv: this.argv,
      env: { NODE_COMPILE_CACHE: config.cacheDirPath, ...process.env },
      execArgv,
      // Don't pipe to parent process. Handled manually in ApplicationThread
      stderr: true,
      workerData: {
        hostOrigin: this.hostOrigin,
        messagePort: port2,
        serializedMocks: this.serializedMocks,
      },
      transferList: [port2],
    });

    thread.on('listening', (origin) => {
      this.appOrigins.add(origin);
    });

    return thread;
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.activeThread?.terminate();
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
    /** @type { (() => void) | undefined } */
    this.resolveStarted;
    /** @type { ((value?: unknown) => void) | undefined } */
    this.rejectStarted;

    this.messagePort.on(
      'message',
      /** @param { ApplicationWorkerMessage} msg */
      (msg) => {
        const { type } = msg;

        if (type === 'started') {
          //
        } else if (type === 'listening') {
          this.isListening = true;
          this.emit('listening', msg.origin);
          // Assume that apps start listening after they are done loading
          this.resolveStarted?.();
        } else if (type === 'watch') {
          if (msg.mode === 'write') {
            if (this.watcher?.has(msg.filePath)) {
              this.watcher.remove(msg.filePath, true);
            }
          } else {
            this.watcher?.add(msg.filePath);
          }
        } else if (type === 'error') {
          if (this.isListening === undefined) {
            this.isListening = false;
            this.rejectStarted?.(msg.error);
          }
          fatal(msg.error);
        }
      },
    );
    this.on('exit', (exitCode) => {
      this.messagePort.removeAllListeners();
      this.messagePort.close();
      // @ts-expect-error - clean up
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
    return new Promise((resolve, reject) => {
      this.resolveStarted = /** @type { () => void } */ (resolve);
      this.rejectStarted = reject;

      debug(`starting application at ${main}`);

      this.messagePort.postMessage({ type: 'start', main });
    });
  }
}
