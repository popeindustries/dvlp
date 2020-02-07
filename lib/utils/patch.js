'use strict';

const { bundle, resolveModuleId } = require('../bundler/index.js');
const { getAbsoluteProjectPath, getProjectPath } = require('./file.js');
const {
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isNodeModuleFilePath,
  isModule,
  isModuleBundlerFilePath,
  isRelativeFilePath
} = require('./is.js');
const { warn, WARN_BARE_IMPORT } = require('./log.js');
const config = require('../config.js');
const debug = require('debug')('dvlp:patch');
const { filePathToUrl } = require('../utils/url.js');
const path = require('path');
const { resolve } = require('../resolver/index.js');
const { unzipSync } = require('zlib');

const RE_CLOSE_BODY_TAG = /<\/body>/i;
const RE_IMPORT = /((?:\bimport\b[^'"]+|\bexport\b[^'"]+\sfrom\s)['"])([^'"\n]+)(['"])/gm;
const RE_NONCE_SHA = /nonce-|sha\d{3}-/;
const RE_OPEN_HEAD_TAG = /<head>/i;

module.exports = {
  patchResponse
};

/**
 * Patch response body.
 * Injects reload script into html response,
 * and resolves import ids for js/css response.
 *
 * @param { string } filePath
 * @param { Req } req
 * @param { Res } res
 * @param { PatchResponseConfig } [options]
 */
function patchResponse(
  filePath,
  req,
  res,
  { rollupConfig, footerScript, headerScript } = {}
) {
  // req.filepath set after file.find(), filepath passed if cached
  filePath = req.filePath || filePath || req.url;
  debug(`patching response for "${getProjectPath(filePath)}"`);
  proxySetHeader(
    res,
    disableContentEncodingHeader.bind(disableContentEncodingHeader, res)
  );
  if (isHtmlRequest(req)) {
    const urls = [];
    const hashes = [];
    const scripts = {
      header: '',
      footer: ''
    };

    if (footerScript) {
      if (footerScript.url) {
        urls.push(footerScript.url);
      }
      if (footerScript.hash) {
        hashes.push(footerScript.hash);
      }
      scripts.footer = footerScript.string;
    }
    if (headerScript) {
      if (headerScript.url) {
        urls.push(headerScript.url);
      }
      if (headerScript.hash) {
        hashes.push(headerScript.hash);
      }
      scripts.header = headerScript.string;
    }
    proxySetHeader(res, injectCSPHeader.bind(injectCSPHeader, urls, hashes));
    proxyBodyWrite(res, (html) => {
      disableCacheControlHeader(res, req.url);
      return injectScripts(scripts, html);
    });
  } else if (isCssRequest(req)) {
    // Disable gzip
    proxyBodyWrite(res, (css) => {
      disableCacheControlHeader(res, req.url);
      return css;
    });
  } else if (isJsRequest(req)) {
    proxyBodyWrite(res, (code) => {
      disableCacheControlHeader(res, req.url);
      return rewriteImports(filePath, rollupConfig, code);
    });
  }
}

/**
 * Disable Content-Encoding headers
 *
 * @param { Res } res
 * @param { string } headerKey
 * @param { string } headerValue
 * @returns { string | undefined }
 */
function disableContentEncodingHeader(res, headerKey, headerValue) {
  const key = headerKey.toLowerCase();

  if (key === 'content-encoding') {
    res.encoding = headerValue;
    return;
  }

  return headerValue;
}

/**
 * Disable Cache-Control, Content-Encoding headers
 *
 * @param { Res } res
 * @param { string } url
 * @returns { void }
 */
function disableCacheControlHeader(res, url) {
  if (!res.headersSent) {
    if (!isNodeModuleFilePath(url) && !isModuleBundlerFilePath(url)) {
      res.setHeader('cache-control', 'no-cache, dvlp-disabled');
    }
  }
}

/**
 * Inject header/footer script tags into 'data'
 *
 * @param { { footer: string, header: string } } scripts
 * @param { string } html
 * @returns { string }
 */
function injectScripts(scripts, html) {
  const { footer, header } = scripts;

  if (header && RE_OPEN_HEAD_TAG.test(html)) {
    debug('injecting header script');
    html = html.replace(RE_OPEN_HEAD_TAG, `<head>\n<script>${header}</script>`);
  }
  if (footer && RE_CLOSE_BODY_TAG.test(html)) {
    debug('injecting footer script');
    html = html.replace(
      RE_CLOSE_BODY_TAG,
      `<script>${footer}</script>\n</body>`
    );
  }

  return html;
}

/**
 * Inject CSP headers allowing inline script tag
 *
 * @param { Array<string> } urls
 * @param { Array<string> } hashes
 * @param { string } key
 * @param { string } value
 * @returns { string }
 */
function injectCSPHeader(urls, hashes, key, value) {
  const lcKey = key.toLowerCase();

  if (
    lcKey === 'content-security-policy-report-only' ||
    lcKey === 'content-security-policy'
  ) {
    const urlsString = urls.join(' ');
    const hashesString = hashes.map((hash) => `'sha256-${hash}'`).join(' ');
    const rules = value
      .split(';')
      .map((ruleString) => ruleString.trim())
      .reduce((/** @type { {[key: string]: string} } */ rules, ruleString) => {
        const firstSpace = ruleString.indexOf(' ');

        rules[ruleString.slice(0, firstSpace)] = ruleString.slice(
          firstSpace + 1
        );
        return rules;
      }, {});

    if (rules['connect-src']) {
      rules['connect-src'] = `${rules['connect-src']} ${urlsString}`;
    } else {
      rules['connect-src'] = urlsString;
    }
    if (
      rules['script-src'] &&
      (RE_NONCE_SHA.test(value) || !value.includes('unsafe-inline'))
    ) {
      rules['script-src'] = `${rules['script-src']} ${hashesString}`;
    }
    if (rules['default-src'] === "'none'") {
      rules['default-src'] = `* ${hashesString}`;
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
 * @param { object } rollupConfig
 * @param { string } code
 * @returns { string }
 */
function rewriteImports(filePath, rollupConfig, code) {
  const projectFilePath = getProjectPath(filePath);
  /** @type { {[key: string]: string} } */
  const rewritten = {};
  let match;

  if (!RE_IMPORT.test(code)) {
    debug(`no imports to rewrite in "${projectFilePath}"`);
    return code;
  }

  RE_IMPORT.lastIndex = 0;
  while ((match = RE_IMPORT.exec(code))) {
    const [context, pre, id, post] = match;
    const importPath = resolve(id, getAbsoluteProjectPath(filePath));
    if (importPath) {
      let newId = '';

      // Bundle if in node_modules and not an es module
      if (isNodeModuleFilePath(importPath) && !isModule(importPath)) {
        const resolvedId = resolveModuleId(id, importPath);

        // Trigger bundling in background while waiting for eventual request
        bundle(resolvedId, id, importPath, rollupConfig);
        newId = `/${path.join(config.bundleDirName, resolvedId)}`;
        warn(WARN_BARE_IMPORT, id);
      } else {
        // Don't rewrite if no change after resolving
        newId =
          isRelativeFilePath(id) &&
          path.join(path.dirname(filePath), id) === importPath
            ? id
            : importPath;
      }

      newId = filePathToUrl(newId);
      debug(`rewrote import id from "${id}" to "${newId}"`);
      rewritten[context] = `${pre}${newId}${post}`;
    } else {
      warn(`⚠️  unable to resolve path for "${id}" from "${projectFilePath}"`);
    }
  }

  for (const importString in rewritten) {
    code = code.replace(importString, rewritten[importString]);
  }

  return code;
}

/**
 * Proxy set header for 'res', performing 'action' on write()/end()
 *
 * @param { Res } res
 * @param { (key: string, value: string) => string | undefined } action
 */
function proxySetHeader(res, action) {
  res.setHeader = new Proxy(res.setHeader, {
    apply(target, ctx, args) {
      let [key, value] = args;

      value = action(key, value);

      if (value) {
        return Reflect.apply(target, ctx, [key, value]);
      }
    }
  });

  res.writeHead = new Proxy(res.writeHead, {
    apply(target, ctx, args) {
      // First argument is always statusCode
      if (args.length > 1) {
        const headers = args[args.length - 1];

        for (const key in headers) {
          const value = action(key, headers[key]);

          if (value) {
            headers[key] = value;
          }
        }
      }

      return Reflect.apply(target, ctx, args);
    }
  });
}

/**
 * Proxy body write for 'res', performing 'action' on write()/end()
 *
 * @param { Res } res
 * @param { (data: string) => string } action
 */
function proxyBodyWrite(res, action) {
  const originalSetHeader = res.setHeader;
  /** @type { Buffer } */
  let buffer;

  // Proxy write() to buffer streaming response
  res.write = new Proxy(res.write, {
    apply(target, ctx, args) {
      let [chunk] = args;

      if (typeof chunk === 'string') {
        chunk = Buffer.from(chunk);
      }
      buffer = Buffer.concat([buffer || Buffer.from(''), chunk]);
      return;
    }
  });

  // Proxy end() to intercept response body
  res.end = new Proxy(res.end, {
    apply(target, ctx, args) {
      let [data = buffer, ...extraArgs] = args;
      let size = 0;

      if (data) {
        if (Buffer.isBuffer(data)) {
          if (res.encoding === 'gzip') {
            data = unzipSync(data);
          }
          data = data.toString();
        }
        data = action(data);
        size = Buffer.byteLength(data);
      }

      if (!res.headersSent) {
        if (size) {
          debug(`setting Content-Length to ${size}`);
          originalSetHeader.call(res, 'Content-Length', size);
        }
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
