'use strict';

const chockidar = require('chokidar');
const debug = require('debug')('dvlp:utils');
const fs = require('fs');
const path = require('path');
const url = require('url');

const INJECTED_SCRIPT = '<script src="http://localhost:35729/livereload.js"></script>';
const RE_BARE_IMPORT = /^[^./]/;
const RE_BODY_TAG = /<\/body>/i;
const RE_IMPORT = /import[^'"]+['"]([^'"]+)['"]/g;
const RE_JS = /.jsm?$/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;

const testing = process.env.NODE_ENV === 'test';

module.exports = {
  findFile,
  injectReloadScript,
  isHtmlRequest,
  isJsModuleRequest,
  isJsRequest,
  log,
  resolveJsImports,
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

function resolveJsImports(res) {
  proxyBodyWrite(res, rewriteImports, 'resolve imports');
}

/**
 * Rewrite bare import references in 'data'
 * @param {Buffer|string} data
 * @returns {Buffer|string}
 */
function rewriteImports(data) {
  const asBuffer = data instanceof Buffer;

  if (asBuffer) {
    data = data.toString();
  }

  if (!RE_IMPORT.test(data)) {
    return data;
  }

  debug('rewriting imports');
  let match;

  RE_IMPORT.lastIndex = 0;
  while ((match = RE_IMPORT.exec(data))) {
    const id = match[1];

    if (RE_BARE_IMPORT(id)) {
      const resolved = require.resolve(id);
    }
  }

  if (asBuffer) {
    data = Buffer.from(data);
  }

  return data;
}

/**
 * Inject livereload script into 'res'
 * @param {http.ServerResponse} res
 */
function injectReloadScript(res) {
  proxyBodyWrite(res, injectAtClosingBody, 'inject script');
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

/**
 * Proxy body write for 'res', performing 'action' on write()/end()
 * @param {http.ServerResponse} res
 * @param {function} action
 * @param {string} debugMsg
 */
function proxyBodyWrite(res, action, debugMsg) {
  // Proxy write() to intercept streaming response
  res.write = new Proxy(res.write, {
    apply(target, ctx, args) {
      debug(`attempting to ${debugMsg} for write()`);

      const [chunk, ...extraArgs] = args;

      return Reflect.apply(target, ctx, [action(chunk), ...extraArgs]);
    }
  });

  // Proxy end() to intercept buffered response
  res.end = new Proxy(res.end, {
    apply(target, ctx, args) {
      let [data, ...extraArgs] = args;

      if (data && (typeof data === 'string' || data instanceof Buffer)) {
        debug(`attempting to ${debugMsg} for end()`);

        data = action(data);
      }

      return Reflect.apply(target, ctx, [data, ...extraArgs]);
    }
  });

  // Prevent setting of Content-Length
  res.setHeader = new Proxy(res.setHeader, {
    apply(target, ctx, args) {
      let [key, value] = args;

      if (key.toLowerCase() === 'content-length') {
        return;
      }

      return Reflect.apply(target, ctx, [key, value]);
    }
  });
}
