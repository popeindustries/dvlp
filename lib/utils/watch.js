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
 * @param { (filePath: string) => void } fn
 * @returns {{ add: (filePath: string) => void, close: () => void } }
 */
module.exports = function watch(fn) {
  const watcher = new FSWatcher({
    ignored: RE_IGNORED,
    ignoreInitial: true,
    persistent: true
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
        return filePath.forEach(this.add);
      }

      filePath = path.resolve(filePath);
      if (!files.has(filePath) && !RE_IGNORED.test(filePath)) {
        debug(`watching file "${getProjectPath(filePath)}"`);
        files.add(filePath);
        watcher.add(filePath);
      }
    },
    close() {
      watcher.close();
      files.clear();
    }
  };
};
