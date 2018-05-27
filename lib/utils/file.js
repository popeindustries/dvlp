'use strict';

const { isHtmlRequest, isJsRequest } = require('./is');
const { bundle, CACHE_DIR_NAME } = require('./module');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const requireModule = require('esm')({});

module.exports = {
  exists,
  find,
  importModule
};

/**
 * Find filepath for 'req'
 * @param {http.ClientRequest} req
 * @param {[string]} [directories]
 * @param {object} [rollupConfig]
 * @returns {Promise<string>}
 */
function find(req, directories = [process.cwd()], rollupConfig) {
  return new Promise(async (resolve, reject) => {
    const url = new URL(req.url, 'http://localhost');
    const missingExtension = !path.extname(url.pathname).length;
    const isHtml = isHtmlRequest(req);
    const isJs = !isHtml && isJsRequest(req);
    let pathname = url.pathname;
    let filepath;

    // Handle bare js import
    if (pathname.includes(CACHE_DIR_NAME)) {
      try {
        filepath = await bundle(null, path.basename(pathname), rollupConfig);
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

/**
 * Validate that all file paths exist
 * @param {string|[string]} filepaths
 */
function exists(filepaths) {
  if (!Array.isArray(filepaths)) {
    filepaths = [filepaths];
  }

  for (const filepath of filepaths) {
    if (!fs.existsSync(path.resolve(filepath))) {
      throw Error(`path '${filepath}' does not exist`);
    }
  }
}

/**
 * Import esm/cjs module, transpiling to cjs if necessary
 * @param {string} modulepath
 * @returns {object}
 */
function importModule(modulepath) {
  let mod = requireModule(modulepath);

  if (!('default' in mod)) {
    mod = { default: mod };
  }

  return mod;
}
