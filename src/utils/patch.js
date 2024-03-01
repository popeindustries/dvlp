import { brotliDecompressSync, unzipSync } from 'node:zlib';
import { createContext, getContextForReq } from './request-contexts.js';
import { fatal, noisyWarn, warn, WARN_BARE_IMPORT } from './log.js';
import { getAbsoluteProjectPath, getProjectPath, isEsmFile } from './file.js';
import { getBundlePath, getBundleSourcePath } from './bundling.js';
import { getPackage, resolve } from '../resolver/index.js';
import {
  isBundledFilePath,
  isBundledUrl,
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isNodeModuleFilePath,
} from './is.js';
import chalk from 'chalk';
import config from '../config.js';
import Debug from 'debug';
import { filePathToUrlPathname } from './url.js';
import { Metrics } from './metrics.js';
import { parse } from 'es-module-lexer';
import path from 'node:path';

const RE_IMPORT_ASSERT = /type\s?:\s?['"]([^'"]+)/;
const RE_CLOSE_BODY_TAG = /<\/body>/i;
const RE_CSS_IMPORT = /(@import\b[^'"]+['"])([^'"\n]+)(['"])/gm;
const RE_DYNAMIC_IMPORT = /(^[^(]+\(['"])([^'"]+)(['"][^)]*\))/;
const RE_HTTP = /^https?:\/\//;
const RE_INLINE_CSP =
  /<meta\s+http-equiv=['"]Content-Security-Policy['"]\s+content=(?:"([^"]+)|'([^']+))['"]\s+\/?>/;
const RE_OPEN_HEAD_TAG = /<head>/i;

const debug = Debug('dvlp:patch');

/**
 * Patch response body.
 * Injects reload script into html response,
 * and resolves import ids for js/css response.
 *
 * @param { Req } req
 * @param { Res } res
 * @param { PatchResponseOptions } options
 */
export function patchResponse(
  req,
  res,
  { footerScript, headerScript, resolveImport, send },
) {
  const context = getContextForReq(req);
  const filePath = req.filePath || context.filePath || req.url;

  debug(`patching response for "${getProjectPath(filePath)}"`);

  proxySetHeader(
    res,
    disableContentEncodingHeader.bind(disableContentEncodingHeader, res),
  );

  if (isHtmlRequest(req)) {
    /** @type { Array<string> } */
    const urls = [];
    const scripts = {
      header: '',
      footer: '',
    };

    if (footerScript) {
      if (footerScript.url) {
        urls.push(footerScript.url);
      }
      scripts.footer = footerScript.string;
    }
    if (headerScript) {
      if (headerScript.url) {
        urls.push(headerScript.url);
      }
      scripts.header = headerScript.string;
    }
    proxySetHeader(res, injectCSPHeader.bind(injectCSPHeader, res, urls));
    proxyBodyWrite(res, (html) => {
      // TODO: parse css/js imports?
      enableCrossOriginHeader(res);
      setCacheControlHeader(res, req.url);

      html = injectCSPMetaTag(res, html, urls);

      const transformed = send?.(filePath, html);

      if (transformed !== undefined) {
        html = transformed;
      }

      return injectScripts(res, scripts, html);
    });
  } else if (isCssRequest(req)) {
    proxyBodyWrite(res, (css) => {
      enableCrossOriginHeader(res);
      // @ts-ignore
      setCacheControlHeader(res, req.url);
      css = rewriteCSSImports(res, filePath, css, resolveImport);

      const transformed = send?.(filePath, css);

      if (transformed !== undefined) {
        css = transformed;
      }

      return css;
    });
  } else if (isJsRequest(req)) {
    proxyBodyWrite(res, (js) => {
      enableCrossOriginHeader(res);
      // @ts-ignore
      setCacheControlHeader(res, req.url);
      js = rewriteJSImports(res, filePath, js, resolveImport);

      const transformed = send?.(filePath, js);

      if (transformed !== undefined) {
        js = transformed;
      }

      return js;
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
 * Set Cache-Control headers
 *
 * @param { Res } res
 * @param { string } url
 * @returns { void }
 */
function setCacheControlHeader(res, url) {
  if (!res.headersSent) {
    let cacheControl = `public, max-age=${config.maxAge}`;

    if (isBundledUrl(url) || isNodeModuleFilePath(url)) {
      cacheControl = `public, max-age=${config.maxAgeLong}`;
    } else {
      cacheControl = 'no-store';
    }

    res.setHeader('cache-control', cacheControl);
  }
}

/**
 * Enable Access-Control-Allow-Origin header
 *
 * @param { Res } res
 */
function enableCrossOriginHeader(res) {
  if (!res.headersSent && !res.hasHeader('Access-Control-Allow-Origin')) {
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
  res.metrics.recordEvent(Metrics.EVENT_NAMES.scripts);

  const { footer, header } = scripts;

  if (header && RE_OPEN_HEAD_TAG.test(html)) {
    debug('injecting header script');
    html = html.replace(
      RE_OPEN_HEAD_TAG,
      `<head>\n<script nonce="dvlp">${header}</script>`,
    );
  }
  if (footer && RE_CLOSE_BODY_TAG.test(html)) {
    debug('injecting footer script');
    html = html.replace(
      RE_CLOSE_BODY_TAG,
      `<script nonce="dvlp">${footer}</script>\n</body>`,
    );
  }

  res.metrics.recordEvent(Metrics.EVENT_NAMES.scripts);
  return html;
}

/**
 * Inject CSP headers allowing inline scripts
 *
 * @param { Res } res
 * @param { Array<string> } urls
 * @param { string } key
 * @param { string } value
 * @returns { string }
 */
function injectCSPHeader(res, urls, key, value) {
  res.metrics.recordEvent(Metrics.EVENT_NAMES.csp);
  const lcKey = key.toLowerCase();

  if (
    lcKey === 'content-security-policy-report-only' ||
    lcKey === 'content-security-policy'
  ) {
    const urlsString = urls.join(' ');
    value = parseCSPRules(value, urlsString);
  }

  res.metrics.recordEvent(Metrics.EVENT_NAMES.csp);

  return value;
}

/**
 * Inject CSP meta tag allowing inline scripts
 *
 * @param { Res } res
 * @param { string } html
 * @param { Array<string> } urls
 * @returns { string }
 */
function injectCSPMetaTag(res, html, urls) {
  const match = RE_INLINE_CSP.exec(html);

  if (match !== null) {
    res.metrics.recordEvent(Metrics.EVENT_NAMES.csp);

    const [matchingTag, doubleQuotedContent, singleQuotedContent] = match;
    const content = doubleQuotedContent ?? singleQuotedContent;

    if (content) {
      const urlsString = urls.join(' ');
      const newContent = parseCSPRules(content, urlsString);

      html = html.replace(
        matchingTag,
        matchingTag.replace(content, newContent),
      );
    }

    res.metrics.recordEvent(Metrics.EVENT_NAMES.csp);
  }

  return html;
}

/**
 * Rewrite import references in "css"
 *
 * @param { Res } res
 * @param { string } filePath
 * @param { string } css
 * @param { PatchResponseOptions["resolveImport"] } [resolveImport]
 * @returns { string }
 */
function rewriteCSSImports(res, filePath, css, resolveImport) {
  res.metrics.recordEvent(Metrics.EVENT_NAMES.imports);

  const projectFilePath = getProjectPath(filePath);

  css = `${css}\n:scope { --__dvlp-file-path__: "${filePath.replace(
    /\\/g,
    '\\\\',
  )}"; }`;

  if (!RE_CSS_IMPORT.test(css)) {
    debug(`no imports to rewrite in "${projectFilePath}"`);
    return css;
  }

  /** @type { {[key: string]: string} } */
  const rewritten = {};
  let match;

  RE_CSS_IMPORT.lastIndex = 0;
  while ((match = RE_CSS_IMPORT.exec(css))) {
    const [matchingString, pre, id, post] = match;

    if (!RE_HTTP.test(id)) {
      let importPath = resolve(id, getAbsoluteProjectPath(filePath));

      // Force relative if not found
      if (importPath === undefined && path.extname(id) !== '') {
        importPath = resolve(`./${id}`, getAbsoluteProjectPath(filePath));
      }

      if (importPath) {
        const newId = filePathToUrlPathname(importPath);

        debug(`rewrote import id from "${id}" to "${newId}"`);

        rewritten[matchingString] = `${pre}${newId}${post}`;
        createContext(newId, undefined, false, importPath, true, 'css');
      } else {
        noisyWarn(
          `${chalk.yellow(
            '⚠️',
          )}  unable to resolve path for "${id}" from "${projectFilePath}"`,
        );
      }
    }
  }

  for (const importString in rewritten) {
    css = css.replace(importString, rewritten[importString]);
  }

  res.metrics.recordEvent(Metrics.EVENT_NAMES.imports);
  return css;
}

/**
 * Rewrite bare import references in 'code'
 *
 * @param { Res } res
 * @param { string } filePath
 * @param { string } js
 * @param { PatchResponseOptions["resolveImport"] } resolveImport
 * @returns { string }
 */
function rewriteJSImports(res, filePath, js, resolveImport) {
  res.metrics.recordEvent(Metrics.EVENT_NAMES.imports);

  // Retrieve original source path from bundled filePath
  // to allow reference back to correct node_modules file
  if (isBundledFilePath(filePath)) {
    [, filePath] = getBundleSourcePath(filePath);
  }

  try {
    const projectFilePath = getProjectPath(filePath);
    const importer = getAbsoluteProjectPath(filePath);
    const [imports] = parse(js);

    if (imports.length > 0) {
      // Track length delta between 'id' and 'newId' to adjust
      // parsed indexes as we substitute during iteration
      let offset = 0;

      for (const { a: assertion, d: dynamic, e, s, se } of imports) {
        const isAssert = assertion > -1;
        const isDynamic = dynamic > -1;
        let start = offset + s;
        let end = offset + e;
        let specifier = js.substring(start, end);
        let after = '';
        let before = '';
        /** @type { ImportAssertionType } */
        let assert = undefined;
        /** @type { string | undefined } */
        let importPath = undefined;

        if (specifier === 'import.meta') {
          continue;
        }

        if (isAssert) {
          const match = RE_IMPORT_ASSERT.exec(
            js.substring(offset + assertion, offset + se),
          );
          if (match) {
            assert = /** @type { ImportAssertionType } */ (match[1]);
          }
        }

        if (isDynamic) {
          // Dynamic import indexes include quotes if strings, so strip from id before resolving
          if (/^['"]/.test(specifier)) {
            specifier = specifier.slice(1, -1);
            start++;
            end--;
          } else {
            // Unable to resolve non-string id, so skip
            continue;
          }
        }

        if (resolveImport) {
          let resolveResult;

          try {
            resolveResult = resolveImport(
              specifier,
              {
                isDynamic,
                importer,
              },
              resolve,
            );
          } catch (err) {
            /** @type { Error & { hooked: boolean } } */ (err).hooked = true;
            throw err;
          }

          if (resolveResult === false) {
            // Force ignored by hook
            continue;
          } else if (resolveResult !== undefined) {
            // Handle import statement substitution
            if (isDynamic && resolveResult.includes('(')) {
              const match = resolveResult.match(RE_DYNAMIC_IMPORT);
              if (match) {
                [, before, importPath, after] = match;
                start -= 8;
                end += 2;
              } else {
                // Error parsing substitution;
                continue;
              }
            } else {
              importPath = path.resolve(resolveResult);
            }
          }
        }

        if (importPath !== undefined) {
          let newId = '';

          // Bundle if in node_modules and not an es module
          if (
            assert === undefined &&
            isNodeModuleFilePath(importPath) &&
            !isEsmFile(importPath, getPackage(importPath, undefined, 'browser'))
          ) {
            // Source path reference stored here...
            const bundlePath = getBundlePath(specifier, importPath);
            newId = `/${bundlePath}`;
            // ...so safe to re-write to output path
            importPath = path.resolve(bundlePath);
            warn(WARN_BARE_IMPORT, `"${specifier}"`);
          } else {
            newId = importPath;
          }

          newId = filePathToUrlPathname(newId);

          if (newId !== specifier || before || after) {
            debug(
              `rewrote${
                isDynamic ? ' dynamic' : ''
              } import id from "${specifier}" to "${newId}"`,
            );
            js =
              js.substring(0, start) +
              before +
              newId +
              after +
              js.substring(end);
            offset +=
              before.length + newId.length + after.length - specifier.length;
          }

          createContext(
            newId,
            assert,
            isDynamic,
            importPath,
            true,
            assert === 'css' ? 'css' : 'js',
          );
        } else {
          noisyWarn(
            `${chalk.yellow(
              '⚠️',
            )}  unable to resolve path for "${specifier}" from "${projectFilePath}"`,
          );
        }
      }
    } else {
      debug(`no imports to rewrite in "${projectFilePath}"`);
    }
  } catch (err) {
    if (/** @type { Error & { hooked: boolean } } */ (err).hooked) {
      fatal(err);
    }
  }

  res.metrics.recordEvent(Metrics.EVENT_NAMES.imports);
  return js;
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
  let ended = false;
  /** @type { Buffer } */
  let buffer;

  // Proxy write() to buffer streaming response
  res.write = new Proxy(res.write, {
    apply(target, ctx, args) {
      // When in HTTP2 compat mode, res.end triggers a final res.write
      if (ended) {
        return Reflect.apply(target, ctx, args);
      }

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
          // @ts-ignore
          originalSetHeader.call(res, 'Content-Length', size);
        }
      }

      ended = true;

      return Reflect.apply(target, ctx, [data, ...extraArgs]);
    },
  });

  // Prevent setting of Content-Length
  res.setHeader = new Proxy(res.setHeader, {
    apply(target, ctx, args) {
      let [key, value] = args;

      if (key.toLowerCase() === 'content-length') {
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
            delete args[args.length - 1][key];
          }
        }
      }

      return Reflect.apply(target, ctx, args);
    },
  });
}

/**
 * @param { string } cspString
 * @param { string } urlsString
 */
function parseCSPRules(cspString, urlsString) {
  const rules = cspString
    .split(';')
    .map((ruleString) => ruleString.trim())
    .reduce((/** @type { {[key: string]: string} } */ rules, ruleString) => {
      const firstSpace = ruleString.indexOf(' ');

      rules[ruleString.slice(0, firstSpace)] = ruleString.slice(firstSpace + 1);
      return rules;
    }, {});

  // Allow dvlp urls
  if (urlsString.length > 0) {
    const connectSrcProp = rules['connect-src'] ? 'connect-src' : 'default-src';

    rules[connectSrcProp] = `${
      rules[connectSrcProp] ? `${rules[connectSrcProp]} ` : ''
    }${urlsString}`;
  }
  // Allow dvlp inlined scripts
  const scriptSrcProp = rules['script-src'] ? 'script-src' : 'default-src';

  if (!rules[scriptSrcProp]?.includes("'unsafe-inline'")) {
    rules[scriptSrcProp] = `${
      rules[scriptSrcProp] ? `${rules[scriptSrcProp]} ` : ''
    }'nonce-dvlp'`;
  }

  return Object.keys(rules).reduce((value, name) => {
    value += `${name} ${rules[name]}; `;
    return value;
  }, '');
}
