'use strict';

const { extensionsByType, bundleDirName } = require('../config');
const path = require('path');
const util = require('util');

const HAS_UTIL_IS_PROXY = util.types && util.types.isProxy;
const RE_CSS = /.css$/i;
const RE_HTML = /.html?$/i;
const RE_INVALID = /[<>:"|?*]/;
const RE_JS = /.jsm?$/i;
const RE_JSON = /.json$/i;
const RE_NODE_MODULES = /node_modules/;
const RE_TYPE_CSS = /text\/css/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;

module.exports = {
  isCssFilepath,
  isCssRequest,
  isHtmlFilepath,
  isHtmlRequest,
  isInvalidFilepath,
  isJsFilepath,
  isJsRequest,
  isJsonFilepath,
  isModuleBundlerFilepath,
  isNodeModuleFilepath,
  isProjectFilepath,
  isPromise,
  isProxy
};

/**
 * Determine if 'obj' is Proxy instance
 * @param {object} obj
 * @returns {boolean}
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
 * @param {object} obj
 * @returns {boolean}
 */
function isPromise(obj) {
  if (HAS_UTIL_IS_PROXY) {
    return util.types.isPromise(obj);
  } else {
    return obj instanceof Promise;
  }
}

/**
 * Determine if 'filepath' is invalid
 * @param {string} filepath
 * @returns {boolean}
 */
function isInvalidFilepath(filepath) {
  return RE_INVALID.test(filepath);
}

/**
 * Determine if 'filepath' is in project
 * @param {string} filepath
 * @returns {boolean}
 */
function isProjectFilepath(filepath) {
  return filepath.includes(process.cwd()) && !isNodeModuleFilepath(filepath);
}

/**
 * Determine if 'filepath' is in node_modules
 * @param {string} filepath
 * @returns {boolean}
 */
function isNodeModuleFilepath(filepath) {
  return RE_NODE_MODULES.test(filepath);
}

/**
 * Determine if 'filepath' is for a bundled module file
 * @param {string} filepath
 * @returns {boolean}
 */
function isModuleBundlerFilepath(filepath) {
  return filepath.includes(bundleDirName);
}

/**
 * Determine if 'filepath' is for a css file
 * @param {string} filepath
 * @returns {boolean}
 */
function isCssFilepath(filepath) {
  return extensionsByType.css.includes(path.extname(filepath));
}

/**
 * Determine if 'filepath' is for an html file
 * @param {string} filepath
 * @returns {boolean}
 */
function isHtmlFilepath(filepath) {
  return extensionsByType.html.includes(path.extname(filepath));
}

/**
 * Determine if 'filepath' is for a js file
 * @param {string} filepath
 * @returns {boolean}
 */
function isJsFilepath(filepath) {
  return extensionsByType.js.includes(path.extname(filepath));
}

/**
 * Determine if 'filepath' is for a js file
 * @param {string} filepath
 * @returns {boolean}
 */
function isJsonFilepath(filepath) {
  return RE_JSON.test(filepath);
}

/**
 * Determine if 'req' is for a css file
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isCssRequest(req) {
  return req.type === 'css' || RE_TYPE_CSS.test(req.headers.accept) || RE_CSS.test(req.url);
}

/**
 * Determine if 'req' is for an html file
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isHtmlRequest(req) {
  return req.type === 'html' || RE_TYPE_HTML.test(req.headers.accept) || RE_HTML.test(req.url);
}

/**
 * Determine if 'req' is for a js file
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isJsRequest(req) {
  return (
    req.type === 'js' ||
    // Almost always '*/*'
    RE_TYPE_JS.test(req.headers.accept) ||
    RE_JS.test(req.url) ||
    // Not set correctly in all browsers when requesting js module dependency
    RE_JS.test(req.referer)
  );
}
