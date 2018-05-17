'use strict';

const chockidar = require('chokidar');
const debug = require('debug')('dvlp:utils');
const fs = require('fs');
const path = require('path');
const url = require('url');

const INJECTED_SCRIPT = '<script src="http://localhost:35729/livereload.js"></script>';
const INJECTED_SCRIPT_LENGTH = Buffer.byteLength(INJECTED_SCRIPT);
const RE_JS = /.jsm?$/i;
const RE_BODY_TAG = /<\/body>/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;

const testing = process.env.NODE_ENV === 'test';

module.exports = {
  findFile,
  INJECTED_SCRIPT_LENGTH,
  injectReloadScript,
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
 * Inject livereload script into 'res'
 * @param {http.ServerResponse} res
 */
function injectReloadScript(res) {
  // Proxy write() to intercept streaming response
  res.write = new Proxy(res.write, {
    apply(target, ctx, args) {
      debug('attempting to inject script for write()');

      const [chunk, ...extraArgs] = args;
      const newChunk = injectAtClosingBody(chunk);

      res.injected = newChunk !== chunk;

      return Reflect.apply(target, ctx, [newChunk, ...extraArgs]);
    }
  });

  // Proxy end() to intercept buffered response
  res.end = new Proxy(res.end, {
    apply(target, ctx, args) {
      let [data, ...extraArgs] = args;

      if (data && (typeof data === 'string' || data instanceof Buffer)) {
        debug('attempting to inject script for end()');

        const newData = injectAtClosingBody(data);

        data = newData;
        res.injected = newData !== data;
        // if (!res.headersSent && length !== newLength) {
        //   debug('updating Content-Length');
        //   res.setHeader('Content-Length', newLength);
        // }
      }

      return Reflect.apply(target, ctx, [data, ...extraArgs]);
    }
  });

  // Proxy setting of Content-Length
  res.setHeader = new Proxy(res.setHeader, {
    apply(target, ctx, args) {
      let [key, value] = args;

      if (key.toLowerCase() === 'content-length' && res.injected) {
        value = parseInt(value) + INJECTED_SCRIPT_LENGTH;
      }
      return Reflect.set(target, ctx, [key, value]);
    }
  });
}

/**
 * Inject script tag into 'data' if it includes a closing </body>
 * @param {Buffer|string} data
 * @returns {Buffer|string}
 */
function injectAtClosingBody(data) {
  const asBuffer = data instanceof Buffer;

  if (asBuffer) {
    data = data.toString();
  }

  if (!RE_BODY_TAG.test(data)) {
    return data;
  }

  debug('injecting script');
  data = data.replace(RE_BODY_TAG, `${INJECTED_SCRIPT}\n</body>`);

  if (asBuffer) {
    data = Buffer.from(data);
  }

  return data;
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
        // TODO: add support for .jsm
      }
    }

    const filepath = path.join(directory, pathname);

    if (fs.existsSync(filepath)) {
      return filepath;
    }
  }

  return null;
}
