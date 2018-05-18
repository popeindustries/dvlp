'use strict';

const { isHtmlRequest, isJsRequest } = require('./is');
const { bundle, CACHE_DIR_NAME } = require('./module');
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
 * @returns {Promise<string>}
 */
function find(req, directories = [process.cwd()]) {
  return new Promise(async (resolve, reject) => {
    let pathname = url.parse(req.url, true).pathname;
    const missingExtension = !path.extname(pathname).length;
    const isHtml = isHtmlRequest(req);
    const isJs = !isHtml && isJsRequest(req);
    let filepath;

    if (pathname.includes(CACHE_DIR_NAME)) {
      try {
        filepath = await bundle(null, path.basename(pathname));
        return resolve(filepath);
      } catch (err) {
        reject(err);
      }
    }

    for (const directory of directories) {
      if (missingExtension) {
        if (isHtml) {
          pathname = path.join(pathname, 'index.html');
        } else if (isJs) {
          pathname += '.js';
          // TODO: add support for .mjs
        }
      }

      filepath = path.join(directory, pathname);

      if (fs.existsSync(filepath)) {
        return resolve(filepath);
      }
    }

    reject(Error(`filepath for ${req.url} not found`));
  });
}
