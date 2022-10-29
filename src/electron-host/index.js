import { error, fatal, noisyInfo } from '../utils/log.js';
import chalk from 'chalk';
import childProcess from 'node:child_process';
import config from '../config.js';
import { createRequire } from 'node:module';
// import Debug from 'debug';
import { fileURLToPath } from 'node:url';
import { getDependencies } from '../utils/module.js';
import { getEntryContents } from './electron-entry.js';
import { getProjectPath } from '../utils/file.js';
import { watch } from '../utils/watch.js';
import { writeFileSync } from 'node:fs';

// const debug = Debug('dvlp:electronhost');
const require = createRequire(import.meta.url);

/**
 * Create electron entry file
 *
 * @param { import('url').URL } filePath
 * @param { string } entryPath
 * @param { string } origin
 */
export function createElectronEntryFile(filePath, entryPath, origin) {
  writeFileSync(filePath, getEntryContents(entryPath, origin));
}

export class ElectronHost {
  /**
   * @param { (filePath: string, silent?: boolean) => void } [triggerClientReload]
   * @param { Array<SerializedMock> } [serializedMocks]
   */
  constructor(triggerClientReload, serializedMocks) {
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
    /** @type { childProcess.ChildProcess } */
    this.activeProcess;
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
        await this.start();
      });
    }
  }

  /**
   * Start electron application
   */
  start() {
    return new Promise(async (resolve, reject) => {
      let isRestart = false;

      if (this.activeProcess !== undefined) {
        this.activeProcess.removeAllListeners();
        this.activeProcess.kill();
        isRestart = true;
      }

      this.activeProcess = this.createProcess();

      this.watcher?.add(
        await getDependencies(
          fileURLToPath(config.electronEntryPath.href),
          'node',
        ),
      );

      this.activeProcess.send(
        { type: 'start', mocks: this.serializedMocks },
        /** @param { Error | null } err */
        (err) => {
          if (err) {
            error(err);
            reject(err);
            return;
          }

          noisyInfo(
            isRestart
              ? '\n  restarting electron application...'
              : `\n  electron application started`,
          );

          resolve(undefined);
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
      [fileURLToPath(config.electronEntryPath.href)],
      {
        stdio: [0, 1, 2, 'ipc'],
      },
    );

    child.on('close', (code) => {
      process.exit(code ?? 1);
    });
    child.on(
      'message',
      /** @param { ElectronProcessMessage } msg */
      (msg) => {
        // switch (msg.type) {
        //   case 'started': {
        //     this.listening();
        //     break;
        //   }
        //   case 'watch': {
        //     if (this.watcher !== undefined) {
        //       this.watcher.add(msg.paths);
        //     }
        //     break;
        //   }
        // }
      },
    );

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
