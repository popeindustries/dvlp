'use strict';

const childWatchEnv = process.env.CHILD_WATCHER;
const useChildWatcher = childWatchEnv && (childWatchEnv !== '0' || childWatchEnv !== 'false');

const FSWatcher = useChildWatcher ? require('fswatcher-child') : require('chokidar').FSWatcher;
const { getProjectPath } = require('./file');
const debug = require('debug')('dvlp:watch');
const path = require('path');

const RE_IGNORED = /(^|[/\\])\..|node_modules|\.dvlp/i;
const TIMEOUT = 1000;

if (useChildWatcher) {
  debug('using child watcher');
}

/**
 * Instantiate a file watcher and begin watching for changes
 * @param {(string) => void} fn
 * @returns {{ add: (string) => void, close: () => void }}
 */
module.exports = function watch(fn) {
  const watcher = new FSWatcher({
    // Ignore hidden and node_modules
    ignored: RE_IGNORED,
    ignoreInitial: true,
    persistent: true
  });
  const files = new Set();
  let changing = false;

  watcher.on('unlink', (filepath) => {
    debug(`unwatching file "${getProjectPath(filepath)}"`);
    watcher.unwatch(filepath);
    files.delete(path.resolve(filepath));
  });
  watcher.on('change', (filepath) => {
    if (!changing) {
      // Prevent double change
      setTimeout(() => {
        changing = false;
      }, TIMEOUT);
      changing = true;
      debug(`change detected "${getProjectPath(filepath)}"`);
      fn(path.resolve(filepath));
    }
  });

  return {
    add(filepath) {
      filepath = path.resolve(filepath);
      if (!files.has(filepath) && !RE_IGNORED.test(filepath)) {
        debug(`watching file "${getProjectPath(filepath)}"`);
        files.add(filepath);
        watcher.add(filepath);
      }
    },
    close() {
      watcher.close();
      files.clear();
    }
  };
};
