'use strict';

const chockidar = require('chokidar');
const debug = require('debug')('dvlp:utils');

const INJECTED_SCRIPT = '<script src="http://localhost:35729/livereload.js"></script>';
const INJECTED_SCRIPT_LENGTH = Buffer.byteLength(INJECTED_SCRIPT);
const RE_ACCEPT_HTML = /text\/html/i;
const RE_BODY_TAG = /<\/body>/i;

const testing = process.env.NODE_ENV === 'test';

module.exports = {
  INJECTED_SCRIPT_LENGTH,
  injectReloadScript,
  isHtmlRequest,
  log,
  watch
};

/**
 * Determine if 'req' is for an html resource
 * @param {http.ClientRequest|http.IncomingMessage} req
 * @returns {boolean}
 */
function isHtmlRequest(req) {
  const accept = 'getHeader' in req ? req.getHeader('accept') : req.headers.accept;

  return RE_ACCEPT_HTML.test(accept);
}

/**
 * Inject livereload script into 'res'
 * @param {http.ServerResponse} res
 */
function injectReloadScript(res) {
  const oldEnd = res.end;
  const oldWrite = res.write;

  // Patch write() to intercept streaming response
  res.write = (chunk, ...args) => {
    debug('attempting to inject script for write()');

    const [newChunk] = injectAtClosingBody(chunk);

    return oldWrite.apply(res, [newChunk, ...args]);
  };

  // Patch end() to intercept buffered response
  res.end = (data, ...args) => {
    if (data && (typeof data === 'string' || data instanceof Buffer)) {
      debug('attempting to inject script for end()');

      const length = res.getHeader('Content-Length');
      const [newData, newLength] = injectAtClosingBody(data);

      data = newData;
      if (!res.headersSent && length !== newLength) {
        debug('updating Content-Length');
        res.setHeader('Content-Length', newLength);
      }
    }

    return oldEnd.apply(res, [data, ...args]);
  };
}

/**
 * Inject script tag into 'data' if it includes a closing </body>
 * @param {Buffer|string} data
 * @returns {[Buffer|string, number]}
 */
function injectAtClosingBody(data) {
  const asBuffer = data instanceof Buffer;

  if (asBuffer) {
    data = data.toString();
  }

  if (RE_BODY_TAG.test(data)) {
    debug('injecting script');
    data = data.replace(RE_BODY_TAG, `${INJECTED_SCRIPT}\n</body>`);
  }

  const length = Buffer.byteLength(data);

  if (asBuffer) {
    data = Buffer.from(data);
  }

  return [data, length];
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
