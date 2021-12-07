import config from '../config.js';
import Debug from 'debug';
import { FSWatcher } from 'chokidar';
import { getProjectPath } from './file.js';
import os from 'os';
import path from 'path';

const TIMEOUT = 1000;

const debug = Debug('dvlp:watch');
const tmpdir = os.tmpdir();

/**
 * Instantiate a file watcher and begin watching for changes
 *
 * @param { (callback: string) => void } fn
 * @returns { Watcher }
 */
export default function watch(fn) {
  const watcher = new FSWatcher({
    ignoreInitial: true,
    persistent: true,
  });
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
    add(filePath) {
      if (Array.isArray(filePath)) {
        // @ts-ignore
        return filePath.forEach(this.add);
      }

      filePath = path.resolve(filePath);

      if (
        !files.has(filePath) &&
        !filePath.startsWith(tmpdir) &&
        !filePath.startsWith(config.dvlpDirPath) &&
        !path.basename(filePath).startsWith('.')
      ) {
        debug(`watching file "${getProjectPath(filePath)}"`);
        files.add(filePath);
        watcher.add(filePath);
      }
    },
    close() {
      watcher.close();
      files.clear();
    },
  };
}
