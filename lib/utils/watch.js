'use strict';

/**
 * @typedef { object } Watcher
 * @property { (filePath: string, allowNodeModules: boolean) => void } add
 * @property { () => void } close
 */

const debug = require('debug')('dvlp:watch');
const { FSWatcher } = require('chokidar');
const { getProjectPath } = require('./file.js');
const path = require('path');

// Hidden, node_modules/*, .dvlp/*
const RE_IGNORED = /(^|[/\\])\..|\.dvlp/i;
const RE_IGNORED_NODE_MODULES = /(^|[/\\])\..|node_modules|\.dvlp/i;
const TIMEOUT = 1000;

/**
 * Instantiate a file watcher and begin watching for changes
 *
 * @param { (string) => void } fn
 * @returns { Watcher }
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
    add(filePath, allowNodeModules = false) {
      if (Array.isArray(filePath)) {
        return filePath.forEach(this.add);
      }

      const re = allowNodeModules ? RE_IGNORED_NODE_MODULES : RE_IGNORED;
      filePath = path.resolve(filePath);

      if (!files.has(filePath) && !re.test(filePath)) {
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
