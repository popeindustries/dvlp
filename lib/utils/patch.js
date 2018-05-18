'use strict';

const { isHtmlRequest, isJsRequest } = require('./is');
const { CACHE_DIR_NAME, bundle, resolve } = require('./module');
const debug = require('debug')('dvlp:patch');
const path = require('path');

const INJECTED_SCRIPT = '<script src="http://localhost:35729/livereload.js"></script>';
const RE_BARE_IMPORT = /^[^./]/;
const RE_BODY_TAG = /<\/body>/i;
const RE_IMPORT = /import[^'"]+['"]([^'"]+)['"]/g;

module.exports = {
  patchRequest,
  patchResponse
};

/**
 * Patch request.
 * Fixes type and missing extension for js request.
 * @param {http.ClientRequest} req
 */
function patchRequest(req) {
  if (isJsRequest(req)) {
    debug(`patching js request for "${req.url}"`);
    // Some browsers specify module type as '*/*', so fix
    req.headers.accept = 'application/javascript';
    // Fix missing extension
    if (!path.extname(req.url)) {
      req.url += '.js';
      // TODO: support .mjs
    }
  }
}

/**
 * Patch response body.
 * Injects reload script into html response,
 * and resolves import ids for js response.
 * @param {http.ClientRequest} req
 * @param {http.ServerResponse} res
 * @param {boolean} isReloading
 */
function patchResponse(req, res, isReloading) {
  if (isJsRequest(req)) {
    debug(`handling js response for "${req.url}"`);
    proxyBodyWrite(res, rewriteImports, 'resolve imports');
  }
  if (isReloading && isHtmlRequest(req)) {
    debug(`handling html response for "${req.url}"`);
    proxyBodyWrite(res, injectAtClosingBody, 'inject script');
  }
}

/**
 * Rewrite bare import references in 'data'
 * @param {Buffer|string} data
 * @returns {Buffer|string}
 */
function rewriteImports(data) {
  const asBuffer = data instanceof Buffer;
  let str = data;

  if (asBuffer) {
    str = data.toString();
  }

  if (!RE_IMPORT.test(str)) {
    return data;
  }

  debug('rewriting imports');
  let match;

  RE_IMPORT.lastIndex = 0;
  while ((match = RE_IMPORT.exec(str))) {
    const [context, id] = match;

    if (RE_BARE_IMPORT.test(id)) {
      // TODO: handle NODE_PATH absolute ids
      const resolvedId = resolve(id);

      if (resolvedId) {
        const newId = `/${CACHE_DIR_NAME}/${resolvedId}`;
        const newContext = context.replace(id, newId);

        debug(`rewrote import id from ${id} to ${newId}`);

        str = str.replace(context, newContext);

        // Trigger bundling
        bundle(id, resolvedId);
      }
    }
  }

  if (asBuffer) {
    str = Buffer.from(str);
  }

  return str;
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
