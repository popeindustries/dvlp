'use strict';

const path = require('path');

const RE_JS = /.jsm?$/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;
const RE_TYPE_ANY = /\*\/\*/;

module.exports = {
  isHtmlRequest,
  isJsRequest
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
  return (
    RE_TYPE_JS.test(req.headers.accept) ||
    RE_JS.test(req.url) ||
    // Would prefer to use referer to test if js module, but not all browsers set it correctly
    (!path.extname(req.url) && RE_TYPE_ANY.test(req.headers.accept))
  );
}
