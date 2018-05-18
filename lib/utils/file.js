'use strict';

const { isHtmlRequest, isJsRequest } = require('./is');
const fs = require('fs');
const path = require('path');
const url = require('url');

module.exports = {
  find
};

/**
 * Find filepath for 'req'
 * @param {http.ClientRequest} req
 * @param {[string]} [directories]
 * @returns {string}
 */
function find(req, directories = [process.cwd()]) {
  let pathname = url.parse(req.url, true).pathname;
  const missingExtension = !path.extname(pathname).length;
  const isHtml = isHtmlRequest(req);
  const isJs = !isHtml && isJsRequest(req);

  for (const directory of directories) {
    if (missingExtension) {
      if (isHtml) {
        pathname = path.join(pathname, 'index.html');
      } else if (isJs) {
        pathname += '.js';
        // TODO: add support for .mjs
      }
    }

    const filepath = path.join(directory, pathname);

    if (fs.existsSync(filepath)) {
      return filepath;
    }
  }

  return null;
}
