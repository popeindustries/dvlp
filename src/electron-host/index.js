import childProcess from 'child_process';
import { createRequire } from 'node:module';
import { fatal } from '../utils/log.js';
import { getEntryContents } from './electron-entry.js';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

/**
 * Create electron entry file
 *
 * @param { import('url').URL } filePath
 * @param { string } entryPath
 * @param { string } origin
 */
export function createElectronEntryFile(filePath, entryPath, origin) {
  const contents = getEntryContents(entryPath, origin);

  writeFileSync(filePath, contents);
}

/**
 * Spawn electron process
 *
 * @param { string } entryPath
 * @param { string } loaderPath
 */
export async function spawnElectron(entryPath, loaderPath) {
  /** @type { string } */
  let pathToElectron;

  try {
    // @ts-expect-error - returns string from here
    pathToElectron = require('electron');
  } catch (err) {
    fatal(
      'unable to resolve "electron" package. Make sure it has been added as a project dependency',
    );
    throw err;
  }

  const child = childProcess.fork(
    pathToElectron,
    [
      '--enable-source-maps',
      '--no-warnings',
      '--experimental-loader',
      loaderPath,
      entryPath,
    ],
    {
      env: {
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: 'inherit',
    },
  );
  child.on('close', function (code, signal) {
    process.exit(code ?? 1);
  });

  handleTerminationSignal(child, 'SIGINT');
  handleTerminationSignal(child, 'SIGTERM');
}

/**
 * @param { import('child_process').ChildProcess } child
 * @param { NodeJS.Signals } signal
 */
function handleTerminationSignal(child, signal) {
  process.on(signal, function signalHandler() {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}
