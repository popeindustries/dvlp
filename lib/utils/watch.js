'use strict';

const { FSWatcher } = require('chokidar');
const { getProjectPath } = require('./file');
const debug = require('debug')('dvlp:watch');
const path = require('path');

const RE_IGNORED = /(^|[/\\])\..|node_modules|\.dvlp/i;

/**
 * Instantiate a file watcher and begin watching for changes
 * @param {(string) => void} fn
 * @returns {{ add: (string) => void, close: () => void }}
 */
module.exports = function watch(fn) {
  const watcher = new FSWatcher({
    // Ignore hidden and node_modules
    ignored: RE_IGNORED,
    persistent: true
  });
  const files = new Set();

  watcher.on('unlink', (filepath) => {
    debug(`unwatching file "${getProjectPath(filepath)}"`);
    watcher.unwatch(filepath);
    files.delete(path.resolve(filepath));
  });
  watcher.on('change', (filepath) => {
    debug(`change detected "${getProjectPath(filepath)}"`);
    fn(path.resolve(filepath));
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
