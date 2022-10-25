import { error, fatal, noisyInfo } from '../utils/log.js';
import chalk from 'chalk';
import childProcess from 'node:child_process';
import config from '../config.js';
import { createRequire } from 'node:module';
// import Debug from 'debug';
import { fileURLToPath } from 'node:url';
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
    this.activeProcess = this.createProcess();
    /** @type { childProcess.ChildProcess } */
    this.pendingProcess = this.createProcess();
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
        // triggerClientReload(filePath, true);
      });
    }
  }

  async start() {
    this.activeProcess.send({ type: 'start' }, (err) => {
      if (err) {
        return error(err);
      }

      noisyInfo(`electron application started`);
    });
  }

  async restart() {
    this.activeProcess.kill();
    this.activeProcess = this.pendingProcess;
    this.pendingProcess = this.createProcess();
    noisyInfo('\n  restarting electron application...');
    await this.start();
  }

  /**
   * @private
   */
  createProcess() {
    const child = childProcess.fork(
      this.pathToElectron,
      [
        '--enable-source-maps',
        '--no-warnings',
        '--experimental-loader',
        config.applicationLoaderPath.href,
        fileURLToPath(config.electronEntryPath.href),
      ],
      {
        env: {
          ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: 'inherit',
      },
    );

    child.on('close', (code) => {
      process.exit(code ?? 1);
    });
    child.on(
      'message',
      /** @param { ElectronProcessMessage } msg */
      (msg) => {
        console.log(msg);
        // msg = JSON.parse(msg);
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

  destroy() {
    this.activeProcess?.kill();
    this.pendingProcess?.kill();
    this.watcher?.close();
  }
}
