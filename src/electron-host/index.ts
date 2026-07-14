import { dirname, relative } from 'node:path';
import { error, fatal, noisyInfo } from '../utils/log.ts';
import { format, msDiff } from '../utils/metrics.ts';
import type { Req, Res } from '../types.ts';
import chalk from 'chalk';
import type { ChildProcess } from 'node:child_process';
import childProcess from 'node:child_process';
import config from '../config.ts';
import { createRequire } from 'node:module';
import Debug from 'debug';
import type { ElectronProcessMessage } from './types.ts';
import { fileURLToPath } from 'node:url';
import { forwardRequest } from '../utils/request.ts';
import { getDependencies } from '../utils/module.ts';
import { getProjectPath } from '../utils/file.ts';
import type { SerializedMock } from '../mock/types.ts';
import { watch } from '../utils/watch.ts';
import type { Watcher } from '../utils/types.ts';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const debug = Debug('dvlp:electronhost');
const require = createRequire(import.meta.url);

/**
 * Generate electron entry file (.cjs)
 */
export function createElectronEntryFile(filePath: URL) {
  writeFileSync(
    filePath,
    `import { bootstrapElectron } from 'dvlp/internal'; bootstrapElectron();`,
  );
}

export class ElectronHost {
  pathToElectron: string;
  appOrigins: Set<string>;
  argv: Array<string>;
  activeProcess!: ChildProcess;
  hostOrigin: string;
  isListening: boolean;
  main: string;
  serializedMocks: Array<SerializedMock> | undefined;
  watcher: Watcher | undefined;

  constructor(
    main: string,
    hostOrigin: string,
    triggerClientReload?: (filePath: string, silent?: boolean) => void,
    serializedMocks?: Array<SerializedMock>,
    argv: Array<string> = [],
  ) {
    try {
      const pathToElectron = require.resolve('electron', {
        paths: [process.cwd()],
      });
      this.pathToElectron = require(relative(__dirname, pathToElectron));
    } catch (err) {
      fatal(
        'unable to resolve "electron" package. Make sure it has been added as a project dependency',
      );
      throw err;
    }

    this.appOrigins = new Set();

    this.argv = argv;
    this.hostOrigin = hostOrigin;
    this.isListening = false;
    this.main = main;
    this.serializedMocks = serializedMocks;

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
   * Start electron application
   */
  async start() {
    this.isListening = false;

    const times: [start: number, stop: number] = [performance.now(), 0];

    debug(`starting Electron application at ${this.main}`);

    this.activeProcess = await this.createProcess();
    this.watcher?.add(await getDependencies(this.main, 'node'));

    times[1] = performance.now();

    noisyInfo(`${format(msDiff(times))} Electron application started`);
  }

  /**
   * Restart electron application
   */
  async restart() {
    if (this.activeProcess !== undefined) {
      debug(`terminating active process`);

      this.activeProcess.removeAllListeners();
      this.activeProcess.send('close');
      // Wait for windows to close
      await new Promise((resolve) => setTimeout(resolve, 100));
      this.activeProcess.kill();

      noisyInfo('\n   restarting Electon application...');
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
   * Pipe incoming request to application running in Electron.
   */
  handle(req: Req, res: Res) {
    debug(`handling request for "${req.url}"`);
    forwardRequest(this.appOrigins, req, res);
  }

  private createProcess(): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const workerData = Buffer.from(
        JSON.stringify({
          hostOrigin: this.hostOrigin,
          main: this.main,
          serializedMocks: this.serializedMocks,
        }),
      ).toString('base64');
      const env: Record<string, string> = {
        NODE_COMPILE_CACHE: config.cacheDirPath,
        ...process.env,
      };
      env['NODE_OPTIONS'] =
        (process.env.NODE_OPTIONS ?? '') +
        ` --experimental-strip-types --disable-warning=ExperimentalWarning`;
      const child = childProcess.spawn(
        this.pathToElectron,
        [
          fileURLToPath(config.electronEntryURL.href),
          '--disable-http-cache',
          `--workerData=${workerData}`,
          ...this.argv,
        ],
        {
          env,
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        },
      );

      child.on('message', async (msg: ElectronProcessMessage) => {
        if (msg.type === 'started') {
          resolve(child);
        } else if (msg.type === 'listening') {
          this.isListening = true;
          this.appOrigins.add(msg.origin);
        } else if (msg.type === 'watch') {
          if (msg.mode === 'write') {
            if (this.watcher?.has(msg.filePath)) {
              this.watcher.remove(msg.filePath, true);
            }
          } else {
            this.watcher?.add(await getDependencies(msg.filePath, 'node'));
          }
        }
      });
      child.on('error', (err) => {
        reject(err);
        error(err);
      });
      child.on('close', (code) => {
        debug('process closed');
        noisyInfo(`    exiting due to Electron application close`);
        process.exit(code ?? 1);
      });
    });
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.activeProcess?.removeAllListeners();
    this.activeProcess?.kill();
    this.watcher?.close();
  }
}
