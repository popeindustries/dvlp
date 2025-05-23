import { dirname, relative } from 'node:path';
import { error, fatal, noisyInfo } from '../utils/log.js';
import { format, msDiff } from '../utils/metrics.js';
import chalk from 'chalk';
import childProcess from 'node:child_process';
import config from '../config.js';
import { createRequire } from 'node:module';
import Debug from 'debug';
import { fileURLToPath } from 'node:url';
import { forwardRequest } from '../utils/request.js';
import { getDependencies } from '../utils/module.js';
import { getProjectPath } from '../utils/file.js';
import { watch } from '../utils/watch.js';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const debug = Debug('dvlp:electronhost');
const require = createRequire(import.meta.url);

/**
 * Generate electron entry file (.cjs)
 *
 * @param { import('url').URL } filePath
 */
export function createElectronEntryFile(filePath) {
  writeFileSync(
    filePath,
    `import { bootstrapElectron } from 'dvlp/internal'; bootstrapElectron();`,
  );
}

export class ElectronHost {
  /**
   * @param { string } main
   * @param { string } hostOrigin
   * @param { (filePath: string, silent?: boolean) => void } [triggerClientReload]
   * @param { Array<SerializedMock> } [serializedMocks]
   * @param { Array<string> } [argv]
   */
  constructor(
    main,
    hostOrigin,
    triggerClientReload,
    serializedMocks,
    argv = [],
  ) {
    try {
      const pathToElectron = require.resolve('electron', {
        paths: [process.cwd()],
      });
      /** @type { string } */
      this.pathToElectron = require(relative(__dirname, pathToElectron));
    } catch (err) {
      fatal(
        'unable to resolve "electron" package. Make sure it has been added as a project dependency',
      );
      throw err;
    }

    /** @type { Set<string> } */
    this.appOrigins = new Set();

    this.argv = argv;
    /** @type { childProcess.ChildProcess } */
    this.activeProcess;
    this.hostOrigin = hostOrigin;
    this.isListening = false;
    this.main = main;
    this.serializedMocks = serializedMocks;
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
   * Start electron application
   */
  async start() {
    this.isListening = false;

    /** @type { [start: number, stop: number] } */
    const times = [performance.now(), 0];

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
   *
   * @param { string | Array<string> } filePaths
   */
  addWatchFiles(filePaths) {
    this.watcher?.add(filePaths);
  }

  /**
   * Handle application request.
   * Pipe incoming request to application running in Electron.
   *
   * @param { Req } req
   * @param { Res } res
   */
  handle(req, res) {
    debug(`handling request for "${req.url}"`);
    forwardRequest(this.appOrigins, req, res);
  }

  /**
   * @private
   */
  createProcess() {
    return new Promise((resolve, reject) => {
      const workerData = Buffer.from(
        JSON.stringify({
          hostOrigin: this.hostOrigin,
          main: this.main,
          serializedMocks: this.serializedMocks,
        }),
      ).toString('base64');
      /** @type {Record<string, string>} */
      const env = { NODE_COMPILE_CACHE: config.cacheDirPath, ...process.env };
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

      child.on(
        'message',
        /** @param { ElectronProcessMessage } msg */
        async (msg) => {
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
        },
      );
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
