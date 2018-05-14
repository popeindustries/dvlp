'use strict';

const chockidar = require('chokidar');

/**
 * Watch 'filepaths' for changes
 * @param {array} filepaths
 * @param {(string) => void} fn
 * @returns {Watcher}
 */
module.exports = function watch(filepaths, fn) {
  const watcher = chockidar.watch(filepaths, {
    // Ignore hidden and node_modules
    ignored: /(^|[/\\])\..|node_modules/,
    persistent: true
  });

  watcher.on('unlink', (filepath) => watcher.unwatch(filepath));
  watcher.on('change', fn);

  return watcher;
};
