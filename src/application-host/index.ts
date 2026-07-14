import { dirname, join } from 'node:path';
import { error, fatal, noisyInfo } from '../utils/log.ts';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, msDiff } from '../utils/metrics.ts';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { MessagePort, WorkerOptions } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Req, Res } from '../types.ts';
import type { ApplicationWorkerMessage } from './types.ts';
import chalk from 'chalk';
import config from '../config.ts';
import Debug from 'debug';
import { forwardRequest } from '../utils/request.ts';
import { getProjectPath } from '../utils/file.ts';
import type { Hooks } from '../hooks/types.ts';
import { performance } from 'node:perf_hooks';
// @ts-expect-error - no types
import semver from 'semver';
import type { SerializedMock } from '../mock/types.ts';
import { watch } from '../utils/watch.ts';
import type { Watcher } from '../utils/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const debug = Debug('dvlp:apphost');
const workerPath = join(__dirname, './application-worker.js');

/**
 * Create application loader based on passed hooks
 */
export function createApplicationLoaderFile(
  filePath: URL,
  hooksConfig: { hooks?: Hooks; hooksPath?: string },
) {
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
  appOrigins: Set<string>;
  argv: Array<string> | undefined;
  hostOrigin: string;
  main: string;
  serializedMocks: Array<SerializedMock> | undefined;
  activeThread: ApplicationThread;
  watcher: Watcher | undefined;

  constructor(
    main: string,
    hostOrigin: string,
    triggerClientReload?: (filePath: string, silent?: boolean) => void,
    serializedMocks?: Array<SerializedMock>,
    argv?: Array<string>,
  ) {
    this.appOrigins = new Set();

    this.argv = argv;
    this.hostOrigin = hostOrigin;
    this.main = pathToFileURL(main).href;
    this.serializedMocks = serializedMocks;
    this.activeThread = this.createThread();

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
   */
  async start(): Promise<void> {
    const times: [start: number, stop: number] = [performance.now(), 0];

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
   */
  addWatchFiles(filePaths: string | Array<string>) {
    this.watcher?.add(filePaths);
  }

  /**
   * Handle application request.
   * Pipe incoming request to application running in active thread.
   */
  handle(req: Req, res: Res) {
    debug(`handling request for "${req.url}"`);

    if (this.activeThread !== undefined && !this.activeThread.isListening) {
      res.writeHead(500);
      res.end('application server failed to start');
      return;
    }

    forwardRequest(this.appOrigins, req, res);
  }

  private createThread() {
    const { port1, port2 } = new MessageChannel();
    const execArgv = ['--enable-source-maps'];

    if (semver.gte(process.version, '21.3.0')) {
      execArgv.push('--disable-warning=ExperimentalWarning');
    }

    port1.unref();

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
  isListening: boolean | undefined;
  isRegistered: boolean;
  messagePort: MessagePort;
  watcher: Watcher | undefined;
  resolveStarted: (() => void) | undefined;
  rejectStarted: ((value?: unknown) => void) | undefined;

  constructor(
    filePath: string,
    messagePort: MessagePort,
    watcher: Watcher | undefined,
    options: WorkerOptions,
  ) {
    super(filePath, options);

    this.isListening = undefined;
    this.isRegistered = false;
    this.messagePort = messagePort;
    this.watcher = watcher;

    this.messagePort.on('message', (msg: ApplicationWorkerMessage) => {
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
    });
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

  start(main: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.resolveStarted = resolve as () => void;
      this.rejectStarted = reject;

      debug(`starting application at ${main}`);

      this.messagePort.postMessage({ type: 'start', main });
    });
  }
}
