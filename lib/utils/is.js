'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 */

const config = require('../config.js');
const fs = require('fs');
const isModuleLib = require('is-module');
const path = require('path');
const util = require('util');

const HAS_UTIL_IS_PROXY = util.types && util.types.isProxy;
const RE_BARE_IMPORT = /^[^./]/;
const RE_INVALID = /[<>:"|?*]/;
const RE_JSON = /.json$/i;
const RE_LOCALHOST = /localhost|127\.0\.0\.1/;
const RE_NODE_MODULES = /node_modules/;
const RE_TYPE_CSS = /text\/css/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;

module.exports = {
  isAbsoluteFilePath,
  isBareImport,
  isCssFilePath,
  isCssRequest,
  isHtmlFilePath,
  isHtmlRequest,
  isInvalidFilePath,
  isJsFilePath,
  isJsRequest,
  isJsonFilePath,
  isLocalhost,
  isNodeModuleFilePath,
  isModule,
  isModuleBundlerFilePath,
  isProjectFilePath,
  isPromise,
  isProxy,
  isRelativeFilePath,
  isValidFilePath
};

/**
 * Determine if "filePath" is absolute
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isAbsoluteFilePath(filePath) {
  return (
    'string' == typeof filePath &&
    path.isAbsolute(filePath) &&
    // Only absolute if from root
    filePath.startsWith(process.cwd().slice(0, 5))
  );
}

/**
 * Determine if 'id' is referencing a node_module
 *
 * @param { string } id
 * @returns { boolean }
 */
function isBareImport(id) {
  return RE_BARE_IMPORT.test(id);
}

/**
 * Determine if 'filePath' is for a css file
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isCssFilePath(filePath) {
  return config.extensionsByType.css.includes(path.extname(filePath));
}

/**
 * Determine if 'req' is for a css file
 *
 * @param { ClientRequest } req
 * @returns { boolean }
 */
function isCssRequest(req) {
  return (
    req.type === 'css' ||
    RE_TYPE_CSS.test(req.headers.accept) ||
    isCssFilePath(req.url)
  );
}

/**
 * Determine if 'filePath' is for an html file
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isHtmlFilePath(filePath) {
  return config.extensionsByType.html.includes(path.extname(filePath));
}

/**
 * Determine if 'req' is for an html file
 *
 * @param { ClientRequest } req
 * @returns { boolean }
 */
function isHtmlRequest(req) {
  return (
    req.type === 'html' ||
    RE_TYPE_HTML.test(req.headers.accept) ||
    isHtmlFilePath(req.url)
  );
}

/**
 * Determine if 'filePath' is invalid
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isInvalidFilePath(filePath) {
  return RE_INVALID.test(filePath);
}

/**
 * Determine if 'filePath' is for a js file
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isJsFilePath(filePath) {
  return config.extensionsByType.js.includes(path.extname(filePath));
}

/**
 * Determine if 'req' is for a js file
 *
 * @param { ClientRequest } req
 * @returns { boolean }
 */
function isJsRequest(req) {
  return (
    req.type === 'js' ||
    // Almost always '*/*'
    RE_TYPE_JS.test(req.headers.accept) ||
    isJsFilePath(req.url)
  );
}

/**
 * Determine if 'filePath' is for a js file
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isJsonFilePath(filePath) {
  return RE_JSON.test(filePath);
}

/**
 * Determine if 'url' is localhost
 *
 * @param { string } url
 * @returns { boolean }
 */
function isLocalhost(url) {
  return RE_LOCALHOST.test(url);
}

/**
 * Determine if 'filePath' is in node_modules
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isNodeModuleFilePath(filePath) {
  const isNodeModule = RE_NODE_MODULES.test(filePath);

  if (!isNodeModule) {
    return false;
  }

  try {
    // Resolve symlinks to determine if really a node_module
    return RE_NODE_MODULES.test(fs.realpathSync(filePath));
  } catch (err) {
    return true;
  }
}

/**
 * Determine if filePath or code is es module
 *
 * @param { string } filePathOrCode
 * @returns { boolean }
 */
function isModule(filePathOrCode) {
  if (isJsFilePath(filePathOrCode)) {
    filePathOrCode = fs.readFileSync(filePathOrCode, 'utf8');
  }
  return isModuleLib(filePathOrCode);
}

/**
 * Determine if 'filePath' is for a bundled module file
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isModuleBundlerFilePath(filePath) {
  return filePath.includes(config.bundleDirName);
}

/**
 * Determine if 'obj' is Proxy
 *
 * @param { object } obj
 * @returns { boolean }
 */
function isProxy(obj) {
  if (HAS_UTIL_IS_PROXY) {
    return util.types.isProxy(obj);
  } else {
    return obj instanceof Proxy;
  }
}

/**
 * Determine if 'obj' is Promise instance
 *
 * @param { object } obj
 * @returns { boolean }
 */
function isPromise(obj) {
  if (HAS_UTIL_IS_PROXY) {
    return util.types.isPromise(obj);
  } else {
    return obj instanceof Promise;
  }
}

/**
 * Determine if 'filePath' is in project
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isProjectFilePath(filePath) {
  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(filePath);
  }

  return filePath.includes(process.cwd());
}

/**
 * Determine if "filePath" is relative
 *
 * @param { string } filePath
 * @returns { boolean }
 */
function isRelativeFilePath(filePath) {
  return 'string' == typeof filePath && filePath.startsWith('.');
}

/**
 * Determine if "filePath" is valid.
 * If relative, resolves against "fromFilePath".
 *
 * @param { string } filePath
 * @param { string } [fromDir]
 * @returns { boolean }
 */
function isValidFilePath(filePath, fromDir = process.cwd()) {
  if (isRelativeFilePath(filePath)) {
    filePath = path.join(fromDir, filePath);
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      return true;
    }
  } catch (err) {
    return false;
  }
}
