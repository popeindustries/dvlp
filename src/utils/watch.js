'use strict';

const { bundleDir } = require('../config.js');
const debug = require('debug')('dvlp:watch');
const { FSWatcher } = require('chokidar');
const { getProjectPath } = require('./file.js');
const os = require('os');
const path = require('path');

const TIMEOUT = 1000;

const homedir = os.homedir();
const tmpdir = os.tmpdir();

/**
 * Instantiate a file watcher and begin watching for changes
 *
 * @param { (callback: string) => void } fn
 * @returns { Watcher }
 */
module.exports = function watch(fn) {
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
      const dirname = path.dirname(filePath);
      const basename = path.basename(filePath);

      if (
        !files.has(filePath) &&
        !filePath.startsWith(tmpdir) &&
        !filePath.startsWith(bundleDir) &&
        !basename.startsWith('.') &&
        dirname !== homedir
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
};
