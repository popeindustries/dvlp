import config from '../config.ts';
import Debug from 'debug';
import { fileURLToPath } from 'node:url';
import { FSWatcher } from 'chokidar';
import { getProjectPath } from './file.ts';
import { isNodeModuleFilePath } from './is.ts';
import os from 'node:os';
import path from 'node:path';
import type { Watcher } from './types.ts';

const CHANGE_DELAY = 250;
const IGNORE_CHANGE_WINDOW = 750;

const debug = Debug('dvlp:watch');
const tmpdir = os.tmpdir();

/**
 * Instantiate a file watcher and begin watching for changes
 */
export function watch(fn: (filePaths: Array<string>) => void): Watcher {
  const banned = new Set<string>();
  const changingFiles = new Set<string>();
  const files = new Set<string>();
  const ignoreTimers = new Set<NodeJS.Timeout>();
  const pendingChanges = new Set<string>();
  const watcher = new FSWatcher({
    ignoreInitial: true,
    persistent: true,
  });
  let changeTimer: NodeJS.Timeout | undefined;

  watcher.on('unlink', (filePath) => {
    debug(`unwatching file "${getProjectPath(filePath)}"`);
    watcher.unwatch(filePath);
    files.delete(path.resolve(filePath));
  });
  watcher.on('change', (filePath) => {
    if (changingFiles.has(filePath) || pendingChanges.has(filePath)) {
      return;
    }

    pendingChanges.add(filePath);

    // Delay to allow time for files to be unwatched when file write intercepted
    // in secondary process, batching any other changes arriving in the window
    changeTimer ??= setTimeout(() => {
      const changed: Array<string> = [];

      changeTimer = undefined;

      for (const pendingFilePath of pendingChanges) {
        if (files.has(pendingFilePath)) {
          changed.push(path.resolve(pendingFilePath));
          changingFiles.add(pendingFilePath);

          // Delay to ignore duplicate changes to same file
          const ignoreTimer = setTimeout(() => {
            ignoreTimers.delete(ignoreTimer);
            changingFiles.delete(pendingFilePath);
          }, IGNORE_CHANGE_WINDOW);
          ignoreTimers.add(ignoreTimer);
        }
      }
      pendingChanges.clear();

      if (changed.length > 0) {
        debug(`change detected "${changed.map(getProjectPath).join('", "')}"`);
        fn(changed);
      }
    }, CHANGE_DELAY);
  });

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
      clearTimeout(changeTimer);
      for (const ignoreTimer of ignoreTimers) {
        clearTimeout(ignoreTimer);
      }
      ignoreTimers.clear();
      banned.clear();
      changingFiles.clear();
      files.clear();
      pendingChanges.clear();
      watcher.close();
    },
  };
}

function resolveFilePath(filePath: string) {
  return path.resolve(
    filePath.startsWith('file://') ? fileURLToPath(filePath) : filePath,
  );
}
