'use strict';

const RE_JS = /.jsm?$/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;

module.exports = {
  isHtmlRequest,
  isJsRequest,
  isJsModuleRequest
};

/**
 * Determine if 'req' is for an html resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isHtmlRequest(req) {
  return RE_TYPE_HTML.test(req.headers.accept);
}

/**
 * Determine if 'req' is for a js resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isJsRequest(req) {
  return isJsModuleRequest(req) || RE_TYPE_JS.test(req.headers.accept) || RE_JS.test(req.url);
}

/**
 * Determine if 'req' is for a js module resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isJsModuleRequest(req) {
  return RE_JS.test(req.headers.referer);
}
