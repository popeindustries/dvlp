'use strict';

const chockidar = require('chokidar');
const debug = require('debug')('dvlp:watch');

/**
 * Watch 'filepaths' for changes
 * @param {array} filepaths
 * @param {(string) => void} fn
 * @returns {Watcher}
 */
module.exports = function watch(filepaths, fn) {
  return new Promise((resolve) => {
    const watcher = chockidar.watch(filepaths, {
      // Ignore hidden and node_modules
      ignored: /(^|[/\\])\..|node_modules/,
      persistent: true
    });

    watcher.on('unlink', (filepath) => {
      debug('unwatching file:', filepath);
      watcher.unwatch(filepath);
    });
    watcher.on('change', (filepath) => {
      debug('change detected:', filepath);
      fn(filepath);
    });
    watcher.on('ready', () => {
      debug('watcher ready');
      resolve(watcher);
    });
  });
};
