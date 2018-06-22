'use strict';

const { bundle, resolveModuleId } = require('./bundler');
const { find } = require('./file');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { isCssRequest, isHtmlRequest, isJsRequest } = require('./is');
const {
  warn,
  WARN_BARE_IMPORT,
  WARN_MISSING_EXTENSION,
  WARN_NODE_PATH,
  WARN_PACKAGE_INDEX
} = require('./log');
const debug = require('debug')('dvlp:patch');
const { bundleDirName } = require('../config');
const path = require('path');
const { URL } = require('url');

const RE_BARE_IMPORT = /^[^./]/;
const RE_BODY_TAG = /<\/body>/i;
const RE_IMPORT = /(import[^'"]+['"])([^'"]+)(['"])/g;

const originalHttpRequest = http.request;
const originalHttpGet = http.get;
const originalHttpsRequest = https.request;
const originalHttpsGet = https.get;
const originalReadStreamRead = fs.ReadStream.prototype._read;
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

module.exports = {
  patchClientRequest,
  patchFileRead,
  patchResponse
};

/**
 * Listen for file system reads and report
 * @param {(string) => void} fn
 * @returns {() => void}
 */
function patchFileRead(fn) {
  if (!(fs.readFile instanceof Proxy)) {
    // Proxy ReadStream private method to work around patching by graceful-fs
    const ReadStream = fs.ReadStream.prototype;

    ReadStream._read = new Proxy(ReadStream._read, {
      apply(target, ctx, args) {
        fn(ctx.path);
        return Reflect.apply(target, ctx, args);
      }
    });

    for (const method of ['readFile', 'readFileSync']) {
      fs[method] = new Proxy(fs[method], {
        apply(target, ctx, args) {
          fn(args[0]);
          return Reflect.apply(target, ctx, args);
        }
      });
    }
  }

  return restoreFileRead;
}

/**
 * Restore file read patch
 */
function restoreFileRead() {
  fs.ReadStream.prototype._read = originalReadStreamRead;
  fs.readFile = originalReadFile;
  fs.readFileSync = originalReadFileSync;
}

/**
 * Listen for client requests
 * @param {(URL) => boolean} fn
 * @returns {() => void}
 */
function patchClientRequest(fn) {
  if (!(http.request instanceof Proxy)) {
    const apply = function apply(target, ctx, args) {
      const url = (args[0] = new URL(
        typeof args[0] === 'string' ? args[0] : getHrefFromRequestOptions(args[0])
      ));

      if (fn(url)) {
        return Reflect.apply(target, ctx, args);
      }
    };

    http.request = new Proxy(http.request, { apply });
    http.get = new Proxy(http.get, { apply });
    https.request = new Proxy(https.request, { apply });
    https.get = new Proxy(https.get, { apply });
  }

  return restoreClientRequest;
}

/**
 * Retrieve href from 'options'
 * @param {object} options
 * @returns {string}
 */
function getHrefFromRequestOptions(options) {
  if (options.href) {
    return options.href;
  }

  let { host = 'localhost', path, port = 80, protocol = 'http:' } = options;

  if (!host.includes(':')) {
    host += `:${port}`;
  }

  return `${protocol}//${host}${path}`;
}

/**
 * Restore client request patch
 */
function restoreClientRequest() {
  http.request = originalHttpRequest;
  http.get = originalHttpGet;
  https.request = originalHttpsRequest;
  https.get = originalHttpsGet;
}

/**
 * Patch response body.
 * Injects reload script into html response,
 * and resolves import ids for js/css response.
 * @param {http.ClientRequest} req
 * @param {http.ServerResponse} res
 * @param {object} [options]
 *  - {[array]} [directories]
 *  - {object} [rollupConfig]
 *  - {string} [scriptString]
 */
function patchResponse(req, res, { directories, rollupConfig, scriptString } = {}) {
  if (isHtmlRequest(req)) {
    debug(`handling html response for "${req.url}"`);
    if (scriptString) {
      proxyBodyWrite(res, injectAtClosingBody.bind(injectAtClosingBody, scriptString));
    }
  } else if (isCssRequest(req)) {
    // TODO: handle css
  } else if (isJsRequest(req)) {
    debug(`handling js response for "${req.url}"`);
    proxyBodyWrite(
      res,
      rewriteImports.bind(rewriteImports, req.filepath, directories, rollupConfig)
    );
  }
}

/**
 * Rewrite bare import references in 'data'
 * @param {string} filepath
 * @param {[string]} directories
 * @param {object} rollupConfig
 * @param {Buffer|string} data
 * @returns {Buffer|string}
 */
function rewriteImports(filepath, directories, rollupConfig, data) {
  const asBuffer = data instanceof Buffer;
  let str = asBuffer ? data.toString() : data;

  if (!RE_IMPORT.test(str)) {
    return data;
  }

  let match;

  RE_IMPORT.lastIndex = 0;
  while ((match = RE_IMPORT.exec(str))) {
    const [context, pre, id, post] = match;
    let newId = '';

    if (RE_BARE_IMPORT.test(id)) {
      const resolvedId = resolveModuleId(id);

      // Bare module import
      if (resolvedId) {
        // Trigger bundling in background while waiting for eventual request
        bundle(id, resolvedId, rollupConfig);
        newId = `/${path.join(bundleDirName, resolvedId)}`;
        warn(WARN_BARE_IMPORT, id);
        // NODE_PATH import
      } else {
        const nodePathDirectories = process.env.NODE_PATH.split(path.delimiter).map((dir) =>
          path.resolve(dir)
        );
        const importpath = find({ url: id }, { directories: nodePathDirectories, type: 'js' });

        if (importpath) {
          newId = path.relative(filepath, importpath);
          warn(WARN_NODE_PATH);
        }
      }
    } else if (!path.extname(id)) {
      const importpath = find({ url: id }, { directories, type: 'js' });

      if (importpath) {
        const basename = path.basename(importpath);
        const extension = path.extname(importpath);

        // Missing extension
        if (basename.replace(extension, '') === path.basename(id)) {
          newId = id + extension;
          warn(WARN_MISSING_EXTENSION);
          // Package index
        } else {
          newId = `${id}/${basename}`;
          warn(WARN_PACKAGE_INDEX);
        }
      }
    }

    if (newId) {
      debug(`rewrote import id from "${id}" to "${newId}"`);
      str = str.replace(context, `${pre}${newId}${post}`);
    }
  }

  if (asBuffer) {
    str = Buffer.from(str);
  }

  return str;
}

/**
 * Inject script tag into 'data' if it includes a closing </body>
 * @param {string} scriptString
 * @param {Buffer|string} data
 * @returns {Buffer|string}
 */
function injectAtClosingBody(scriptString, data) {
  const asBuffer = data instanceof Buffer;

  if (asBuffer) {
    data = data.toString();
  }

  if (!RE_BODY_TAG.test(data)) {
    return data;
  }

  debug('injecting script');
  data = data.replace(RE_BODY_TAG, `<script>${scriptString}</script>\n</body>`);

  if (asBuffer) {
    data = Buffer.from(data);
  }

  return data;
}

/**
 * Proxy body write for 'res', performing 'action' on write()/end()
 * @param {http.ServerResponse} res
 * @param {function} action
 */
function proxyBodyWrite(res, action) {
  const originalSetHeader = res.setHeader;
  let size = 0;

  // Proxy write() to intercept streaming response
  res.write = new Proxy(res.write, {
    apply(target, ctx, args) {
      let [chunk, ...extraArgs] = args;

      chunk = action(chunk);
      size += Buffer.byteLength(chunk);

      return Reflect.apply(target, ctx, [chunk, ...extraArgs]);
    }
  });

  // Proxy end() to intercept buffered response
  res.end = new Proxy(res.end, {
    apply(target, ctx, args) {
      let [data, ...extraArgs] = args;

      if (data && (typeof data === 'string' || data instanceof Buffer)) {
        data = action(data);
        size = Buffer.byteLength(data);
      }

      if (!res.headersSent && size) {
        debug(`setting Content-Length to ${size}`);
        originalSetHeader.call(res, 'Content-Length', size);
      }

      return Reflect.apply(target, ctx, [data, ...extraArgs]);
    }
  });

  // Prevent setting of Content-Length
  res.setHeader = new Proxy(res.setHeader, {
    apply(target, ctx, args) {
      let [key, value] = args;
      if (key.toLowerCase() === 'content-length') {
        debug(`prevented setting Content-Length to ${value}`);
        return;
      }

      return Reflect.apply(target, ctx, [key, value]);
    }
  });

  // Prevent setting of Content-Length
  res.writeHead = new Proxy(res.writeHead, {
    apply(target, ctx, args) {
      // First argument is always statusCode
      if (args.length > 1) {
        for (const key in args[args.length - 1]) {
          if (key.toLowerCase() === 'content-length') {
            debug(`prevented setting Content-Length to ${args[args.length - 1][key]}`);
            delete args[args.length - 1][key];
          }
        }
      }

      return Reflect.apply(target, ctx, args);
    }
  });
}
