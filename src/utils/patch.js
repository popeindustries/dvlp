import { brotliDecompressSync, unzipSync } from 'zlib';
import { fatal, warn, WARN_BARE_IMPORT } from './log.js';
import { getAbsoluteProjectPath, getProjectPath, isEsmFile } from './file.js';
import {
  isBundledFilePath,
  isBundledUrl,
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isNodeModuleFilePath,
} from './is.js';
import { parseOriginalBundledSourcePath, resolveBundleFileName } from './bundling.js';
import config from '../config.js';
import Debug from 'debug';
import { filePathToUrl } from './url.js';
import Metrics from './metrics.js';
import { parse } from 'es-module-lexer';
import path from 'path';
import { resolve } from '../resolver/index.js';

const RE_CLOSE_BODY_TAG = /<\/body>/i;
const RE_DYNAMIC_IMPORT = /(^[^(]+\(['"])([^'"]+)(['"][^)]*\))/;
const RE_NONCE_SHA = /nonce-|sha\d{3}-/;
const RE_OPEN_HEAD_TAG = /<head>/i;

const debug = Debug('dvlp:patch');

/**
 * Patch response body.
 * Injects reload script into html response,
 * and resolves import ids for js/css response.
 *
 * @param { string | undefined } resolvedFilePath
 * @param { Req } req
 * @param { Res } res
 * @param { PatchResponseOptions } options
 */
export function patchResponse(resolvedFilePath, req, res, { footerScript, headerScript, resolveImport, send }) {
  // req.filepath set after file.find()
  const filePath = req.filePath || resolvedFilePath || req.url;

  debug(`patching response for "${getProjectPath(filePath)}"`);
  proxySetHeader(res, disableContentEncodingHeader.bind(disableContentEncodingHeader, res));
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
    proxySetHeader(res, injectCSPHeader.bind(injectCSPHeader, res, urls, hashes));
    proxyBodyWrite(res, (html) => {
      enableCrossOriginHeader(res);
      disableCacheControlHeader(res, req.url);

      if (send) {
        const transformed = send(filePath, html);

        if (transformed !== undefined) {
          html = transformed;
        }
      }

      return injectScripts(res, scripts, html);
    });
  } else if (isCssRequest(req)) {
    proxyBodyWrite(res, (css) => {
      enableCrossOriginHeader(res);
      // @ts-ignore
      disableCacheControlHeader(res, req.url);

      if (send) {
        const transformed = send(filePath, css);

        if (transformed !== undefined) {
          css = transformed;
        }
      }

      return css;
    });
  } else if (isJsRequest(req)) {
    proxyBodyWrite(res, (code) => {
      enableCrossOriginHeader(res);
      // @ts-ignore
      disableCacheControlHeader(res, req.url);
      code = rewriteImports(res, filePath, code, resolveImport);

      if (send) {
        const transformed = send(filePath, code);

        if (transformed !== undefined) {
          code = transformed;
        }
      }

      return code;
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
    if (!isNodeModuleFilePath(url) && !isBundledUrl(url)) {
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
  res.metrics.recordEvent(Metrics.EVENT_NAMES.scripts);

  const { footer, header } = scripts;

  if (header && RE_OPEN_HEAD_TAG.test(html)) {
    debug('injecting header script');
    html = html.replace(RE_OPEN_HEAD_TAG, `<head>\n<script>${header}</script>`);
  }
  if (footer && RE_CLOSE_BODY_TAG.test(html)) {
    debug('injecting footer script');
    html = html.replace(RE_CLOSE_BODY_TAG, `<script>${footer}</script>\n</body>`);
  }

  res.metrics.recordEvent(Metrics.EVENT_NAMES.scripts);
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
  res.metrics.recordEvent(Metrics.EVENT_NAMES.csp);
  const lcKey = key.toLowerCase();

  if (lcKey === 'content-security-policy-report-only' || lcKey === 'content-security-policy') {
    const urlsString = urls.join(' ');
    const hashesString = hashes.map((hash) => `'sha256-${hash}'`).join(' ');
    const rules = value
      .split(';')
      .map((ruleString) => ruleString.trim())
      .reduce((/** @type { {[key: string]: string} } */ rules, ruleString) => {
        const firstSpace = ruleString.indexOf(' ');

        rules[ruleString.slice(0, firstSpace)] = ruleString.slice(firstSpace + 1);
        return rules;
      }, {});

    if (rules['connect-src']) {
      rules['connect-src'] = `${rules['connect-src']} ${urlsString}`;
    } else {
      rules['connect-src'] = urlsString;
    }
    if (rules['script-src'] && (RE_NONCE_SHA.test(value) || !value.includes('unsafe-inline'))) {
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

  res.metrics.recordEvent(Metrics.EVENT_NAMES.csp);

  return value;
}

/**
 * Rewrite bare import references in 'code'
 *
 * @param { Res } res
 * @param { string } filePath
 * @param { string } code
 * @param { PatchResponseOptions["resolveImport"] } resolveImport
 * @returns { string }
 */
function rewriteImports(res, filePath, code, resolveImport) {
  res.metrics.recordEvent(Metrics.EVENT_NAMES.imports);

  // Retrieve original source path from bundled file
  // to allow reference back to correct node_modules file
  if (isBundledFilePath(filePath)) {
    filePath = parseOriginalBundledSourcePath(code);
  }

  try {
    const projectFilePath = getProjectPath(filePath);
    const importer = getAbsoluteProjectPath(filePath);
    const [imports] = parse(code);

    if (imports.length > 0) {
      // Track length delta between 'id' and 'newId' to adjust
      // parsed indexes as we substitue during iteration
      let offset = 0;

      for (const { d, e, s } of imports) {
        const isDynamic = d > -1;
        let start = offset + s;
        let end = offset + e;
        let specifier = code.substring(start, end);
        let after = '';
        let before = '';
        let importPath;

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

        if (importPath) {
          let newId = '';

          // Bundle if in node_modules and not an es module
          if (isNodeModuleFilePath(importPath) && !isEsmFile(importPath)) {
            const resolvedId = resolveBundleFileName(specifier, importPath);
            newId = `/${path.join(config.bundleDirName, resolvedId)}`;
            warn(WARN_BARE_IMPORT, specifier);
          } else {
            newId = importPath;
          }

          newId = filePathToUrl(newId);

          if (newId !== specifier || before || after) {
            debug(`rewrote${isDynamic ? ' dynamic' : ''} import id from "${specifier}" to "${newId}"`);
            code = code.substring(0, start) + before + newId + after + code.substring(end);
            offset += before.length + newId.length + after.length - specifier.length;
          }
        } else {
          warn(`⚠️  unable to resolve path for "${specifier}" from "${projectFilePath}"`);
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
          // @ts-ignore
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
