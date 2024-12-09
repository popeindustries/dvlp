import config from '../config.js';
import Debug from 'debug';
import { fileURLToPath } from 'node:url';
import { FSWatcher } from 'chokidar';
import { getProjectPath } from './file.js';
import { isNodeModuleFilePath } from './is.js';
import os from 'node:os';
import path from 'node:path';
import { throttle } from './throttle.js';

const THROTTLE_LIMIT = 500;

const debug = Debug('dvlp:watch');
const tmpdir = os.tmpdir();

/**
 * Instantiate a file watcher and begin watching for changes
 *
 * @param { (callback: string) => void } fn
 * @returns { Watcher }
 */
export function watch(fn) {
  /** @type { Set<string> } */
  const banned = new Set();
  /** @type { Set<string> } */
  const files = new Set();
  const watcher = new FSWatcher({
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on('unlink', (filePath) => {
    debug(`unwatching file "${getProjectPath(filePath)}"`);
    watcher.unwatch(filePath);
    files.delete(path.resolve(filePath));
  });
  watcher.on(
    'change',
    // Throttle to allow time for files to be unwatched when file write intercepted in secondary process
    throttle(
      /**
       * @param { string } filePath
       */
      (filePath) => {
        if (files.has(filePath)) {
          debug(`change detected "${getProjectPath(filePath)}"`);
          fn(path.resolve(filePath));
        }
      },
      THROTTLE_LIMIT,
    ),
  );

  return {
    has(filePath) {
      return files.has(resolveFilePath(filePath));
    },
    add(filePath) {
      if (filePath instanceof Set || Array.isArray(filePath)) {
        for (const file of filePath) {
          this.add(file);
        }
        return;
      }

      filePath = resolveFilePath(filePath);

      if (
        !banned.has(filePath) &&
        !files.has(filePath) &&
        !filePath.startsWith(tmpdir) &&
        !filePath.startsWith(config.dvlpDirPath) &&
        !path.basename(filePath).startsWith('.') &&
        !isNodeModuleFilePath(filePath)
      ) {
        debug(`watching file "${getProjectPath(filePath)}"`);
        files.add(filePath);
        watcher.add(filePath);
      }
    },
    remove(filePath, permanent = false) {
      debug(`unwatching file "${getProjectPath(filePath)}"`);
      filePath = resolveFilePath(filePath);
      files.delete(filePath);
      watcher.unwatch(filePath);
      if (permanent) {
        banned.add(filePath);
      }
    },
    close() {
      banned.clear();
      files.clear();
      watcher.close();
    },
  };
}

/**
 * @param { string } filePath
 */
function resolveFilePath(filePath) {
  return path.resolve(
    filePath.startsWith('file://') ? fileURLToPath(filePath) : filePath,
  );
}
