'use strict';

const { FSWatcher } = require('chokidar');
const debug = require('debug')('dvlp:watch');
const path = require('path');

/**
 * Instantiate a file watcher and begin watching for changes
 * @param {(string) => void} fn
 * @returns {{ add: (string) => void, close: () => void }}
 */
module.exports = function watch(fn) {
  const watcher = new FSWatcher({
    // Ignore hidden and node_modules
    ignored: /(^|[/\\])\..|node_modules/,
    persistent: true
  });
  let files = {};

  watcher.on('unlink', (filepath) => {
    debug('unwatching file:', filepath);
    watcher.unwatch(filepath);
    delete files[filepath];
  });
  watcher.on('change', (filepath) => {
    debug('change detected:', filepath);
    fn(filepath);
  });

  return {
    add(filepath) {
      filepath = path.relative(process.cwd(), filepath);

      if (!files[filepath]) {
        debug('watching file:', filepath);
        files[filepath] = true;
        watcher.add(filepath);
      }
    },
    close() {
      watcher.close();
      files = {};
    }
  };
};
