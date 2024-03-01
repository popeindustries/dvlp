import config from '../config.js';
import Debug from 'debug';
import { fileURLToPath } from 'node:url';
import { FSWatcher } from 'chokidar';
import { getProjectPath } from './file.js';
import { isNodeModuleFilePath } from './is.js';
import os from 'node:os';
import path from 'node:path';

const TIMEOUT = 1000;

const debug = Debug('dvlp:watch');
const tmpdir = os.tmpdir();

/**
 * Instantiate a file watcher and begin watching for changes
 *
 * @param { (callback: string) => void } fn
 * @returns { Watcher }
 */
export function watch(fn) {
  const watcher = new FSWatcher({
    ignoreInitial: true,
    persistent: true,
  });
  /** @type { Set<string> } */
  const banned = new Set();
  /** @type { Set<string> } */
  const files = new Set();
  let changing = false;

  watcher.on('unlink', (filePath) => {
    debug(`unwatching file "${getProjectPath(filePath)}"`);
    watcher.unwatch(filePath);
    files.delete(path.resolve(filePath));
  });
  watcher.on('change', (filePath) => {
    if (!changing) {
      // Prevent double change
      setTimeout(() => {
        changing = false;
      }, TIMEOUT);
      changing = true;
      debug(`change detected "${getProjectPath(filePath)}"`);
      fn(path.resolve(filePath));
    }
  });

  return {
    has(filePath) {
      return files.has(resolveFilePath(filePath));
    },
    add(filePath) {
      if (filePath instanceof Set) {
        Array.from(filePath).forEach(this.add);
        return;
      }
      if (Array.isArray(filePath)) {
        filePath.forEach(this.add);
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
