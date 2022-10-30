import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { error, fatal, noisyInfo } from '../utils/log.js';
import chalk from 'chalk';
import childProcess from 'node:child_process';
import config from '../config.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getDependencies } from '../utils/module.js';
import { getProjectPath } from '../utils/file.js';
import { watch } from '../utils/watch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Copy electron entry file
 *
 * @param { import('url').URL } filePath
 */
export function createElectronEntryFile(filePath) {
  if (!existsSync(config.electronDirPath)) {
    mkdirSync(config.electronDirPath);
  }
  copyFileSync(join(__dirname, 'electron-entry.cjs'), filePath);
}

export class ElectronHost {
  /**
   * @param { string } main
   * @param { string } origin
   * @param { (filePath: string, silent?: boolean) => void } [triggerClientReload]
   * @param { Array<SerializedMock> } [serializedMocks]
   * @param { Array<string> } [argv]
   */
  constructor(main, origin, triggerClientReload, serializedMocks, argv = []) {
    try {
      /** @type { string } */
      // @ts-ignore
      this.pathToElectron = require('electron');
    } catch (err) {
      fatal(
        'unable to resolve "electron" package. Make sure it has been added as a project dependency',
      );
      throw err;
    }
    this.argv = argv;
    /** @type { childProcess.ChildProcess } */
    this.activeProcess;
    this.isListening = false;
    this.origin = origin;
    this.main = main;
    this.serializedMocks = serializedMocks;
    /** @type { Watcher | undefined } */
    this.watcher;
    /** @type { ((value?: void | PromiseLike<void>) => void) | undefined } */
    this.resolveStarted;
    /** @type { ((value?: unknown) => void) | undefined } */
    this.rejectStarted;

    if (triggerClientReload !== undefined) {
      this.watcher = watch(async (filePath) => {
        noisyInfo(
          `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.cyan(
            getProjectPath(filePath),
          )}`,
        );
        await this.start();
      });
      this.addWatchFiles(this.main);
    }
  }

  /**
   * Add `filePaths` to file watcher.
   * Includes dependencies since electron doesn't support esm loaders
   *
   * @param { string | Array<string> } filePaths
   */
  async addWatchFiles(filePaths) {
    if (this.watcher !== undefined) {
      if (!Array.isArray(filePaths)) {
        filePaths = [filePaths];
      }

      for (const filePath of filePaths) {
        this.watcher.add(await getDependencies(filePath, 'node'));
      }
    }
  }

  /**
   * Start/restart electron application
   */
  start() {
    this.isListening = false;

    return new Promise(async (resolve, reject) => {
      this.resolveStarted = resolve;
      this.rejectStarted = reject;

      let isRestart = false;

      if (this.activeProcess !== undefined) {
        this.activeProcess.removeAllListeners();
        this.activeProcess.kill();
        isRestart = true;
      }

      this.activeProcess = this.createProcess();

      this.activeProcess.send(
        {
          type: 'start',
          main: this.main,
          mocks: this.serializedMocks,
          origin: this.origin,
        },
        /** @param { Error | null } err */
        (err) => {
          if (err) {
            error(err);
            this.rejectStarted?.(err);
            return;
          }

          noisyInfo(
            isRestart
              ? '\n  restarting electron application...'
              : `\n  electron application started`,
          );
        },
      );
    });
  }

  /**
   * @private
   */
  createProcess() {
    const child = childProcess.spawn(
      this.pathToElectron,
      [fileURLToPath(config.electronEntryURL.href), ...this.argv],
      {
        stdio: ['pipe', 'inherit', 'pipe', 'ipc'],
      },
    );

    child.on(
      'message',
      /** @param { ElectronProcessMessage } msg */
      (msg) => {
        if (msg.type === 'started') {
          this.resolveStarted?.();
          this.isListening = true;
          this.resolveStarted = this.rejectStarted = undefined;
        }
      },
    );
    child.on('error', (err) => {
      if (!this.isListening) {
        this.rejectStarted?.(err);
      } else {
        error(err);
      }
    });
    child.on('close', (code) => {
      if (this.isListening) {
        process.exit(code ?? 1);
      }
    });
    child.stderr?.on('data', (chunk) => {
      error(chunk.toString().trimEnd());
    });

    return child;
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
