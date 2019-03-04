'use strict';

const FSWatcher = require('fswatcher-child');
const { getProjectPath } = require('./file.js');
const debug = require('debug')('dvlp:watch');
const path = require('path');

// Hidden, node_modules/*, .dvlp/*
const RE_IGNORED = /(^|[/\\])\..|node_modules|\.dvlp/i;
const TIMEOUT = 1000;

/**
 * Instantiate a file watcher and begin watching for changes
 *
 * @param { (filepath: string) => void } fn
 * @returns {{ add: (filepath: string) => void, close: () => void } }
 */
module.exports = function watch(fn) {
  const watcher = new FSWatcher({
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
      if (Array.isArray(filepath)) {
        return filepath.forEach(this.add);
      }

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
