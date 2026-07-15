import { dirname, join } from 'node:path';
import { error, fatal, noisyInfo } from '../utils/log.ts';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, msDiff } from '../utils/metrics.ts';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { MessagePort, WorkerOptions } from 'node:worker_threads';
import {
  readDependencyManifest,
  writeDependencyManifest,
} from '../utils/dependency-manifest.ts';
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
  private standbyThread: ApplicationThread | undefined;
  private dependencies = new Set<string>();
  private persistTimer: NodeJS.Timeout | undefined;
  private restarting = false;
  private restartPending = false;

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
      this.watcher = watch(async (filePaths) => {
        noisyInfo(
          `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.cyan(
            filePaths.map(getProjectPath).join(', '),
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

    // Seed the watcher from the persisted manifest so watching is live before
    // the app finishes importing. The worker then streams the live dependency
    // set (from its actual import graph) via 'watch' messages.
    const persisted = readDependencyManifest(this.main);
    for (const filePath of persisted) {
      this.dependencies.add(filePath);
    }
    this.watcher?.add(persisted);

    await this.activeThread.start(this.main);

    times[1] = performance.now();
    noisyInfo(`${format(msDiff(times))} application server started`);

    // Pre-warm the next thread (worker boot + loader registration) so a
    // restart only pays for the app import itself. Restarts only happen
    // in response to watched file changes, so skip if not watching.
    if (this.watcher !== undefined) {
      this.standbyThread ??= this.createThread();
    }
  }

  /**
   * Restart application.
   * Changes arriving while a restart is already in flight
   * are coalesced into a single follow-up restart.
   */
  async restart() {
    if (this.activeThread === undefined) {
      return;
    }
    if (this.restarting) {
      this.restartPending = true;
      return;
    }
    this.restarting = true;

    try {
      debug(`terminating thread with id "${this.activeThread.threadId}"`);

      this.activeThread.removeAllListeners();
      await this.activeThread.terminate();
      this.activeThread = this.standbyThread ?? this.createThread();
      this.standbyThread = undefined;

      noisyInfo('\n  restarting application server...');
      await this.start();
    } finally {
      this.restarting = false;
    }

    if (this.restartPending) {
      this.restartPending = false;
      await this.restart();
    }
  }

  /**
   * Add "filePaths" to watcher
   */
  addWatchFiles(filePaths: string | Array<string>) {
    this.watcher?.add(filePaths);
  }

  /**
   * Add watch dependency "filePath" streamed from the running app's import graph,
   * persisting the accumulated set (debounced) whenever it changes
   */
  private addDependency(filePath: string) {
    this.watcher?.add(filePath);

    // Only manifest files accepted by the watcher (excludes node_modules etc.)
    if (this.watcher?.has(filePath) && !this.dependencies.has(filePath)) {
      this.dependencies.add(filePath);
      this.schedulePersist();
    }
  }

  /**
   * Stop watching "filePath" written to by the running app
   */
  private removeDependency(filePath: string) {
    if (this.watcher?.has(filePath)) {
      this.watcher.remove(filePath, true);
    }
    if (this.dependencies.delete(filePath)) {
      this.schedulePersist();
    }
  }

  private schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      writeDependencyManifest(this.main, this.dependencies);
    }, 1000);
    this.persistTimer.unref?.();
  }

  private flushPersist() {
    if (this.persistTimer !== undefined) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
      writeDependencyManifest(this.main, this.dependencies);
    }
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

    const dependencyCallbacks: DependencyCallbacks = {
      add: (filePath) => this.addDependency(filePath),
      remove: (filePath) => this.removeDependency(filePath),
    };
    const thread = new ApplicationThread(
      workerPath,
      port1,
      dependencyCallbacks,
      {
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
      },
    );

    thread.on('listening', (origin) => {
      this.appOrigins.add(origin);
    });

    return thread;
  }

  /**
   * Destroy instance
   */
  async destroy(): Promise<void> {
    this.flushPersist();
    this.watcher?.close();
    await Promise.allSettled([
      this.activeThread?.terminate(),
      this.standbyThread?.terminate(),
    ]);
  }
}

interface DependencyCallbacks {
  add: (filePath: string) => void;
  remove: (filePath: string) => void;
}

class ApplicationThread extends Worker {
  isListening: boolean | undefined;
  isRegistered: boolean;
  messagePort: MessagePort;
  dependencyCallbacks: DependencyCallbacks | undefined;
  resolveStarted: (() => void) | undefined;
  rejectStarted: ((value?: unknown) => void) | undefined;

  constructor(
    filePath: string,
    messagePort: MessagePort,
    dependencyCallbacks: DependencyCallbacks | undefined,
    options: WorkerOptions,
  ) {
    super(filePath, options);

    this.isListening = undefined;
    this.isRegistered = false;
    this.messagePort = messagePort;
    this.dependencyCallbacks = dependencyCallbacks;

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
          this.dependencyCallbacks?.remove(msg.filePath);
        } else {
          this.dependencyCallbacks?.add(msg.filePath);
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
      this.dependencyCallbacks = undefined;
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
