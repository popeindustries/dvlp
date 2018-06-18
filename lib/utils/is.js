'use strict';

const RE_CSS = /.css$/i;
const RE_HTML = /.html?$/i;
const RE_JS = /.jsm?$/i;
const RE_TYPE_CSS = /text\/css/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;

module.exports = {
  isCssRequest,
  isHtmlRequest,
  isJsRequest
};

/**
 * Determine if 'req' is for a css resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isCssRequest(req) {
  return RE_TYPE_CSS.test(req.headers.accept) || RE_CSS.test(req.url);
}

/**
 * Determine if 'req' is for an html resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isHtmlRequest(req) {
  return RE_TYPE_HTML.test(req.headers.accept) || RE_HTML.test(req.url);
}

/**
 * Determine if 'req' is for a js resource
 * @param {http.ClientRequest} req
 * @returns {boolean}
 */
function isJsRequest(req) {
  return (
    // Almost always '*/*'
    RE_TYPE_JS.test(req.headers.accept) ||
    RE_JS.test(req.url) ||
    // Not set correctly in all browsers when requesting js module dependency
    RE_JS.test(req.referer)
  );
}
