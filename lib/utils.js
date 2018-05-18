'use strict';

const chockidar = require('chokidar');
const debug = require('debug')('dvlp:utils');
const fs = require('fs');
const path = require('path');
const url = require('url');

const RE_JS = /.jsm?$/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;

const testing = process.env.NODE_ENV === 'test';

module.exports = {
  findFile,
  isHtmlRequest,
  isJsModuleRequest,
  isJsRequest,
  log,
  watch
};

/**
 * Determine if 'req' is for an html resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isHtmlRequest(req) {
  return RE_TYPE_HTML.test(req.headers.accept);
}

/**
 * Determine if 'req' is for a js resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isJsRequest(req) {
  return isJsModuleRequest(req) || RE_TYPE_JS.test(req.headers.accept) || RE_JS.test(req.url);
}

/**
 * Determine if 'req' is for a js module resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isJsModuleRequest(req) {
  return RE_JS.test(req.headers.referer);
}

/**
 * Watch 'filepaths' for changes
 * @param {array} filepaths
 * @param {(string) => void} fn
 * @returns {Watcher}
 */
function watch(filepaths, fn) {
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
}

/**
 * Log if not testing
 * @param {*} args
 */
function log(...args) {
  if (!testing) {
    console.log(...args);
  }
}

/**
 * Find filepath for 'req'
 * @param {http.ClientRequest} req
 * @param {[string]} [directories]
 * @returns {string}
 */
function findFile(req, directories = [process.cwd()]) {
  let pathname = url.parse(req.url, true).pathname;
  const missingExtension = !path.extname(pathname).length;
  const isHtml = isHtmlRequest(req);
  const isJs = !isHtml && isJsRequest(req);

  for (const directory of directories) {
    if (missingExtension) {
      if (isHtml) {
        pathname = path.join(pathname, 'index.html');
      } else if (isJs) {
        pathname += '.js';
        // TODO: add support for .mjs
      }
    }

    const filepath = path.join(directory, pathname);

    if (fs.existsSync(filepath)) {
      return filepath;
    }
  }

  return null;
}
