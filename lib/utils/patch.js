'use strict';

const { bundle, resolveModuleId } = require('./bundler');
const { find } = require('./file');
const { isCssRequest, isHtmlRequest, isJsRequest, isNodeModuleFilepath } = require('./is');
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
const resolveFrom = require('resolve-from');

const RE_BARE_IMPORT = /^[^./]/;
const RE_BODY_TAG = /<\/body>/i;
const RE_IMPORT = /(\bimport [^'"]*['"])([^'"]+)(['"])/g;

module.exports = {
  patchResponse
};

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
 * @param {string} [filepath]
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
    let importpath;
    let newId = '';

    if (RE_BARE_IMPORT.test(id)) {
      const dirpath = filepath ? path.dirname(filepath) : process.cwd();

      try {
        // Throws
        importpath = resolveFrom(dirpath, id);

        if (isNodeModuleFilepath(importpath)) {
          const resolvedId = resolveModuleId(id, dirpath);

          // Trigger bundling in background while waiting for eventual request
          bundle(resolvedId, id, rollupConfig);
          newId = `/${path.join(bundleDirName, resolvedId)}`;
          warn(WARN_BARE_IMPORT, id);
        }
      } catch (err) {
        if (process.env.NODE_PATH !== undefined) {
          // NODE_PATH with non-default/missing extension
          const nodePathDirectories = process.env.NODE_PATH.split(path.delimiter).map((dir) =>
            path.resolve(dir)
          );

          importpath = find({ url: id }, { directories: nodePathDirectories, type: 'js' });
        }
      } finally {
        // Convert NODE_PATH resolved path to absolute
        if (importpath && !newId) {
          newId = `/${path.relative(process.cwd(), importpath)}`;
          warn(WARN_NODE_PATH);
        }
      }
    } else if (!path.extname(id)) {
      importpath = find({ url: id }, { directories, type: 'js' });

      if (importpath) {
        const basename = path.basename(importpath);
        const extension = path.extname(importpath);

        // Missing extension
        if (basename.replace(extension, '') === path.basename(id)) {
          newId = id + extension;
          warn(WARN_MISSING_EXTENSION);
        } else {
          // Package index
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
