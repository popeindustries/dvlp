'use strict';

const { brotliDecompressSync, unzipSync } = require('zlib');
const {
  bundle,
  parseOriginalSourcePath,
  resolveModuleId,
} = require('../bundler/index.js');
const { getAbsoluteProjectPath, getProjectPath } = require('./file.js');
const {
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isNodeModuleFilePath,
  isModule,
  isModuleBundlerFilePath,
  isRelativeFilePath,
} = require('./is.js');
const { warn, WARN_BARE_IMPORT } = require('./log.js');
const config = require('../config.js');
const debug = require('debug')('dvlp:patch');
const { filePathToUrl } = require('../utils/url.js');
const path = require('path');
const { performance } = require('perf_hooks');
const { resolve } = require('../resolver/index.js');

const RE_CLOSE_BODY_TAG = /<\/body>/i;
const RE_IMPORT = /((?:(?:^|[});]\s*)import\b[^'"&;:-=()]+|\bexport\b[^'"&;:-=()]+\sfrom\s)['"])([^'"\n]+)(['"])/gm;
const RE_NONCE_SHA = /nonce-|sha\d{3}-/;
const RE_OPEN_HEAD_TAG = /<head>/i;

module.exports = {
  patchResponse,
};

/**
 * Patch response body.
 * Injects reload script into html response,
 * and resolves import ids for js/css response.
 *
 * @param { string } filePath
 * @param { Req } req
 * @param { Res } res
 * @param { PatchResponseOptions } options
 */
function patchResponse(
  filePath,
  req,
  res,
  { rollupConfigPath, footerScript, headerScript } = { rollupConfigPath: '' },
) {
  // req.filepath set after file.find(), filepath passed if cached
  filePath = req.filePath || filePath || req.url;
  debug(`patching response for "${getProjectPath(filePath)}"`);
  proxySetHeader(
    res,
    disableContentEncodingHeader.bind(disableContentEncodingHeader, res),
  );
  if (isHtmlRequest(req)) {
    const urls = [];
    const hashes = [];
    const scripts = {
      header: '',
      footer: '',
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
    proxySetHeader(
      res,
      injectCSPHeader.bind(injectCSPHeader, res, urls, hashes),
    );
    proxyBodyWrite(res, (html) => {
      enableCrossOriginHeader(res);
      disableCacheControlHeader(res, req.url);
      return injectScripts(res, scripts, html);
    });
  } else if (isCssRequest(req)) {
    // Disable gzip
    proxyBodyWrite(res, (css) => {
      enableCrossOriginHeader(res);
      // @ts-ignore
      disableCacheControlHeader(res, req.url);
      return css;
    });
  } else if (isJsRequest(req)) {
    proxyBodyWrite(res, (code) => {
      enableCrossOriginHeader(res);
      // @ts-ignore
      disableCacheControlHeader(res, req.url);
      return rewriteImports(res, filePath, rollupConfigPath, code);
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
 * Enable Access-Control-Allow-Origin header
 *
 * @param { Res } res
 */
function enableCrossOriginHeader(res) {
  if (!res.headersSent) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}

/**
 * Inject header/footer script tags into 'data'
 *
 * @param { Res } res
 * @param { { footer: string, header: string } } scripts
 * @param { string } html
 * @returns { string }
 */
function injectScripts(res, scripts, html) {
  res.metrics.recordEvent('inject HTML scripts');

  const { footer, header } = scripts;

  if (header && RE_OPEN_HEAD_TAG.test(html)) {
    debug('injecting header script');
    html = html.replace(RE_OPEN_HEAD_TAG, `<head>\n<script>${header}</script>`);
  }
  if (footer && RE_CLOSE_BODY_TAG.test(html)) {
    debug('injecting footer script');
    html = html.replace(
      RE_CLOSE_BODY_TAG,
      `<script>${footer}</script>\n</body>`,
    );
  }

  res.metrics.recordEvent('inject HTML scripts');
  return html;
}

/**
 * Inject CSP headers allowing inline script tag
 *
 * @param { Res } res
 * @param { Array<string> } urls
 * @param { Array<string> } hashes
 * @param { string } key
 * @param { string } value
 * @returns { string }
 */
function injectCSPHeader(res, urls, hashes, key, value) {
  res.metrics.recordEvent('inject CSP header');
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
          firstSpace + 1,
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

  res.metrics.recordEvent('inject CSP header');

  return value;
}

/**
 * Rewrite bare import references in 'data'
 *
 * @param { Res } res
 * @param { string } filePath
 * @param { string } rollupConfigPath
 * @param { string } code
 * @returns { string }
 */
function rewriteImports(res, filePath, rollupConfigPath, code) {
  res.metrics.recordEvent('rewrite JS imports');

  const projectFilePath = getProjectPath(filePath);
  /** @type { {[key: string]: string} } */
  const rewritten = {};
  const start = performance.now();
  let match;

  // Retrieve original source path from bundled file to allow reference back to correct node_modules
  if (isModuleBundlerFilePath(filePath)) {
    filePath = parseOriginalSourcePath(code);
  }

  RE_IMPORT.lastIndex = 0;
  if (!RE_IMPORT.test(code)) {
    debug(`no imports to rewrite in "${projectFilePath}"`);
    res.metrics.recordEvent('rewrite JS imports');
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
        bundle(resolvedId, rollupConfigPath, id, importPath);
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

      if (newId !== id) {
        debug(`rewrote import id from "${id}" to "${newId}"`);
        rewritten[context] = `${pre}${newId}${post}`;
      }
    } else {
      warn(`⚠️  unable to resolve path for "${id}" from "${projectFilePath}"`);
    }
  }

  for (const importString in rewritten) {
    code = code.replace(
      importString,
      // Escape '$' to avoid special replacement patterns
      rewritten[importString].replace(/\$/g, '$$$'),
    );
  }

  debug(
    `rewrote "${projectFilePath}" imports in ${
      Math.floor((performance.now() - start) * 100) / 100
    }ms`,
  );

  res.metrics.recordEvent('rewrite JS imports');

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
    },
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
    },
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
    // @ts-ignore
    apply(target, ctx, args) {
      let [chunk] = args;

      if (typeof chunk === 'string') {
        chunk = Buffer.from(chunk);
      }
      buffer = Buffer.concat([buffer || Buffer.from(''), chunk]);
      return;
    },
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
          } else if (res.encoding === 'br') {
            data = brotliDecompressSync(data);
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
    },
  });

  // Prevent setting of Content-Length
  res.setHeader = new Proxy(res.setHeader, {
    apply(target, ctx, args) {
      let [key, value] = args;

      if (key.toLowerCase() === 'content-length') {
        // debug(`prevented setting Content-Length to ${value}`);
        return;
      }

      return Reflect.apply(target, ctx, [key, value]);
    },
  });

  // Prevent setting of Content-Length
  res.writeHead = new Proxy(res.writeHead, {
    apply(target, ctx, args) {
      // First argument is always statusCode
      if (args.length > 1) {
        for (const key in args[args.length - 1]) {
          if (key.toLowerCase() === 'content-length') {
            // debug(
            //   `prevented setting Content-Length to ${
            //     args[args.length - 1][key]
            //   }`,
            // );
            delete args[args.length - 1][key];
          }
        }
      }

      return Reflect.apply(target, ctx, args);
    },
  });
}
