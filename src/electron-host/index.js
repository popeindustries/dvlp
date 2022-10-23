import childProcess from 'child_process';
import { createRequire } from 'node:module';
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
 * @param { string } filePath
 * @param { string } loaderPath
 */
export async function spawnElectron(filePath, loaderPath) {
  const pathToElectron = require('electron');
  const child = childProcess.spawn(
    /** @type { any } */ (pathToElectron),
    ['--experimental-loader', loaderPath, filePath],
    {
      env: {
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: 'inherit',
      windowsHide: false,
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
