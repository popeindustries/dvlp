'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 * @typedef { import("http").ServerResponse } ServerResponse
 */

const { bundle, resolveModuleId } = require('../bundler/bundle.js');
const { find, resolveFrom } = require('./file.js');
const {
  isBareImport,
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isNodeModuleFilePath,
  isModule,
  isModuleBundlerFilePath
} = require('./is.js');
const {
  warn,
  WARN_BARE_IMPORT,
  WARN_MISSING_EXTENSION,
  WARN_NODE_PATH,
  WARN_PACKAGE_INDEX
} = require('./log.js');
const debug = require('debug')('dvlp:patch');
const { bundleDirName } = require('../config.js');
const path = require('path');

const RE_BODY_TAG = /<\/body>/i;
const RE_IMPORT = /^(import\b[^'"]+['"]|export\b.+from\s+['"])([^'"]+)(['"])/gm;
const RE_NONCE_SHA = /nonce-|sha\d{3}-/;

module.exports = {
  patchResponse
};

/**
 * Patch response body.
 * Injects reload script into html response,
 * and resolves import ids for js/css response.
 *
 * @param { string } filePath
 * @param { ClientRequest } req
 * @param { ServerResponse } res
 * @param { object } [options]
 * @param { Array<string> } [options.directories]
 * @param { object } [options.rollupConfig]
 * @param { string } [options.scriptHash]
 * @param { string } [options.scriptString]
 * @param { string } [options.scriptUrl]
 */
function patchResponse(
  filePath,
  req,
  res,
  { directories, rollupConfig, scriptHash, scriptString, scriptUrl } = {}
) {
  proxySetHeader(res, disableCacheHeader.bind(disableCacheHeader, req.url));
  if (isHtmlRequest(req)) {
    if (scriptUrl) {
      proxySetHeader(
        res,
        injectCSPHeader.bind(injectCSPHeader, scriptUrl, scriptHash)
      );
    }
    if (scriptString) {
      proxyBodyWrite(
        res,
        injectAtClosingBody.bind(injectAtClosingBody, scriptString)
      );
    }
  } else if (isCssRequest(req)) {
    // TODO: handle css?
  } else if (isJsRequest(req)) {
    proxyBodyWrite(
      res,
      rewriteImports.bind(
        rewriteImports,
        // req.filepath set after file.find(), filepath passed if cached
        req.filePath || filePath || req.url,
        directories,
        rollupConfig
      )
    );
  }
}

/**
 * Disable Cache-Control header
 *
 * @param { string } url
 * @param { string } key
 * @param { string } value
 * @returns { string }
 */
function disableCacheHeader(url, key, value) {
  const lcKey = key.toLowerCase();

  if (
    lcKey === 'cache-control' &&
    !isNodeModuleFilePath(url) &&
    !isModuleBundlerFilePath(url)
  ) {
    value = 'no-cache, dvlp-disabled';
  }

  return value;
}

/**
 * Inject script tag into 'data' if it includes a closing </body>
 *
 * @param { string } scriptString
 * @param { Buffer | string } data
 * @returns { Buffer | string }
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
 * Inject CSP headers allowing inline script tag
 *
 * @param { string } scriptUrl
 * @param { string } scriptHash
 * @param { string } key
 * @param { string } value
 * @returns { string }
 */
function injectCSPHeader(scriptUrl, scriptHash, key, value) {
  const lcKey = key.toLowerCase();

  if (
    lcKey === 'content-security-policy-report-only' ||
    lcKey === 'content-security-policy'
  ) {
    const rules = value
      .split(';')
      .map((ruleString) => ruleString.trim())
      .reduce((rules, ruleString) => {
        const firstSpace = ruleString.indexOf(' ');

        rules[ruleString.slice(0, firstSpace)] = ruleString.slice(
          firstSpace + 1
        );
        return rules;
      }, {});

    if (rules['connect-src']) {
      rules['connect-src'] = `${rules['connect-src']} ${scriptUrl}`;
    } else {
      rules['connect-src'] = scriptUrl;
    }
    if (
      rules['script-src'] &&
      (RE_NONCE_SHA.test(value) || !value.includes('unsafe-inline'))
    ) {
      rules['script-src'] = `${rules['script-src']} 'sha256-${scriptHash}'`;
    }

    value = Object.keys(rules).reduce((value, name) => {
      value += `${name} ${rules[name]}; `;
      return value;
    }, '');
  }

  return value;
}

/**
 * Rewrite bare import references in 'data'
 *
 * @param { string } filePath
 * @param { Array<string> } directories
 * @param { object } rollupConfig
 * @param { Buffer | string } data
 * @returns { Buffer | string }
 */
function rewriteImports(filePath, directories, rollupConfig, data) {
  const asBuffer = data instanceof Buffer;
  const dirpath = path.dirname(filePath);
  const parentIsNodeModule = filePath ? isNodeModuleFilePath(filePath) : true;
  let str = asBuffer ? data.toString() : data;
  let match;

  if (!RE_IMPORT.test(str)) {
    return data;
  }

  RE_IMPORT.lastIndex = 0;
  while ((match = RE_IMPORT.exec(str))) {
    const [context, pre, id, post] = match;
    let importpath;
    let newId = '';

    // Force resolving all node_modules ids to handle browser field rewriting
    if (isBareImport(id) || parentIsNodeModule) {
      try {
        // Throws
        importpath = resolveFrom(dirpath, id);

        // Bundle if in node_modules and not an es module
        if (isNodeModuleFilePath(importpath) && !isModule(importpath)) {
          const resolvedId = resolveModuleId(id, importpath, dirpath);

          // Trigger bundling in background while waiting for eventual request
          bundle(resolvedId, id, rollupConfig);
          newId = `/${path.join(bundleDirName, resolvedId)}`;
          warn(WARN_BARE_IMPORT, id);
        }
      } catch (err) {
        if (process.env.NODE_PATH !== undefined) {
          // NODE_PATH with non-default/missing extension
          const nodePathDirectories = process.env.NODE_PATH.split(
            path.delimiter
          ).map((dir) => path.resolve(dir));

          importpath = find(
            { url: id },
            { directories: nodePathDirectories, type: 'js' }
          );
          warn(WARN_NODE_PATH);
        }
      } finally {
        // Convert es module node_module or NODE_PATH resolved path
        if (importpath && !newId) {
          newId = path.relative(process.cwd(), importpath);
          // Force absolute
          if (isBareImport(newId)) {
            newId = `/${newId}`;
          }
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
 * Proxy set header for 'res', performing 'action' on write()/end()
 *
 * @param { ServerResponse } res
 * @param { function } action
 */
function proxySetHeader(res, action) {
  res.setHeader = new Proxy(res.setHeader, {
    apply(target, ctx, args) {
      let [key, value] = args;

      value = action(key, value);
      return Reflect.apply(target, ctx, [key, value]);
    }
  });

  res.writeHead = new Proxy(res.writeHead, {
    apply(target, ctx, args) {
      // First argument is always statusCode
      if (args.length > 1) {
        const headers = args[args.length - 1];

        for (const key in headers) {
          headers[key] = action(key, headers[key]);
        }
      }

      return Reflect.apply(target, ctx, args);
    }
  });
}

/**
 * Proxy body write for 'res', performing 'action' on write()/end()
 *
 * @param { ServerResponse } res
 * @param { function } action
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
            debug(
              `prevented setting Content-Length to ${
                args[args.length - 1][key]
              }`
            );
            delete args[args.length - 1][key];
          }
        }
      }

      return Reflect.apply(target, ctx, args);
    }
  });
}
