'use strict';

const { isCssRequest, isHtmlRequest, isJsRequest } = require('./is');
const { CACHE_DIR_NAME, bundle, resolve } = require('./module');
const debug = require('debug')('dvlp:patch');

const RE_BARE_IMPORT = /^[^./]/;
const RE_BODY_TAG = /<\/body>/i;
const RE_IMPORT = /(import[^'"]+['"])([^'"]+)(['"])/g;

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
    // Most browsers specify module type as '*/*', so fix
    req.headers.accept = 'application/javascript';
  }
}

/**
 * Patch response body.
 * Injects reload script into html response,
 * and resolves import ids for js/css response.
 * @param {http.ClientRequest} req
 * @param {http.ServerResponse} res
 * @param {string} scriptString
 */
function patchResponse(req, res, scriptString = '') {
  if (isHtmlRequest(req)) {
    debug(`handling html response for "${req.url}"`);
    if (scriptString) {
      proxyBodyWrite(res, injectAtClosingBody.bind(injectAtClosingBody, scriptString));
    }
  } else if (isCssRequest(req)) {
    // TODO: handle css
  } else if (isJsRequest(req)) {
    debug(`handling js response for "${req.url}"`);
    proxyBodyWrite(res, rewriteImports);
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

  let match;

  RE_IMPORT.lastIndex = 0;
  while ((match = RE_IMPORT.exec(str))) {
    const [context, pre, id, post] = match;

    if (RE_BARE_IMPORT.test(id)) {
      // TODO: handle NODE_PATH absolute ids
      const resolvedId = resolve(id);

      if (resolvedId) {
        const newId = `/${CACHE_DIR_NAME}/${resolvedId}`;

        str = str.replace(context, `${pre}${newId}${post}`);
        debug(`rewrote import id from "${id}" to "${newId}"`);

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
          if (key.toLocaleLowerCase() === 'content-length') {
            debug(`prevented setting Content-Length to ${args[args.length - 1][key]}`);
            delete args[args.length - 1][key];
          }
        }
      }

      return Reflect.apply(target, ctx, args);
    }
  });
}
