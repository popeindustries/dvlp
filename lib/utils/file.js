'use strict';

const { isCssRequest, isHtmlRequest, isJsRequest } = require('./is');
const { bundle, CACHE_DIR_NAME } = require('./module');
const { URL } = require('url');
const { warn, WARN_MISSING_EXTENSION, WARN_PACKAGE_INDEX } = require('./log');
const fs = require('fs');
const path = require('path');
const requireModule = require('esm')({});

const EXTENSIONS = {
  css: ['.css'],
  html: ['.html', '.htm'],
  js: ['.js', '.mjs']
};

const originalReadStreamRead = fs.ReadStream.prototype._read;
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

module.exports = {
  exists,
  find,
  getProjectPath,
  importModule,
  listenForFileRead,
  urlMatchesFilepath
};

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
 * Find filepath for 'req'
 * @param {http.ClientRequest} req
 * @param {[string]} [directories]
 * @param {object} [rollupConfig]
 * @returns {Promise<string>}
 */
function find(req, directories = [process.cwd()], rollupConfig) {
  return new Promise(async (resolve, reject) => {
    const url = new URL(req.url, 'http://localhost');
    const type = getType(req);
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
      filepath = resolveFilepath(path.join(directory, pathname), type);

      if (filepath) {
        return resolve(filepath);
      }
    }

    reject(Error(`filepath for ${req.url} not found`));
  });
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

/**
 * Listen for file system reads and report
 * @param {string} cwd
 * @param {(string) => void} fn
 * @returns {() => void}
 */
function listenForFileRead(cwd, fn) {
  // Proxy ReadStream private method to work around patching by graceful-fs
  const ReadStream = fs.ReadStream.prototype;

  ReadStream._read = new Proxy(ReadStream._read, {
    apply(target, ctx, args) {
      callIfProjectFile(ctx.path, cwd, fn);
      return Reflect.apply(target, ctx, args);
    }
  });

  for (const method of ['readFile', 'readFileSync']) {
    fs[method] = new Proxy(fs[method], {
      apply(target, ctx, args) {
        callIfProjectFile(args[0], cwd, fn);
        return Reflect.apply(target, ctx, args);
      }
    });
  }

  return function revertEavesdrop() {
    fs.ReadStream.prototype._read = originalReadStreamRead;
    fs.readFile = originalReadFile;
    fs.readFileSync = originalReadFileSync;
  };
}

/**
 * Determine if 'url' matches 'filepath'
 * @param {string} url
 * @param {string} filepath
 * @returns {boolean}
 */
function urlMatchesFilepath(url, filepath) {
  const extname = path.extname(filepath);
  const name = path.basename(filepath, extname);
  const basename = path.basename(filepath);
  const dirname = path.basename(path.dirname(filepath));
  const reqExtname = path.extname(url);
  const reqName = path.basename(url, reqExtname);
  const reqBasename = path.basename(url);

  if (
    basename === reqBasename ||
    // /foo/bar == /some/path/bar.js
    (!reqExtname && name === reqName) ||
    // /foo/bar == /some/path/bar/index.js
    (name === 'index' && reqBasename === dirname)
  ) {
    return true;
  }

  return false;
}

/**
 * Retrieve the project relative path for 'filepath'
 * @param {string} filepath
 * @returns {string}
 */
function getProjectPath(filepath) {
  return path.relative(process.cwd(), filepath);
}

/**
 * Call 'fn' if 'filepath' is a project file
 * @param {string} filepath
 * @param {string} cwd
 * @param {(string) => void} fn
 */
function callIfProjectFile(filepath, cwd, fn) {
  if (isInCwd(cwd, filepath) && !isNodeModule(filepath)) {
    fn(filepath);
  }
}

/**
 * Determine if 'filepath' is child of 'cwd'
 * @param {string} cwd
 * @param {string} filepath
 * @returns {boolean}
 */
function isInCwd(cwd, filepath) {
  return filepath.includes(cwd);
}

/**
 * Determine if 'filepath' is in node_modules
 * @param {string} filepath
 * @returns {boolean}
 */
function isNodeModule(filepath) {
  return filepath.includes('node_modules');
}

/**
 * Retrieve resource type
 * @param {http.ClientRequest} req
 * @returns {string}
 */
function getType(req) {
  if (isHtmlRequest(req)) {
    return 'html';
  } else if (isCssRequest(req)) {
    return 'css';
  } else if (isJsRequest(req)) {
    return 'js';
  } else {
    return '';
  }
}

/**
 * Resolve 'filepath' of 'type'
 * Handles missing extensions and package indexes
 * @param {string} filepath
 * @param {string} type
 * @returns {boolean}
 */
function resolveFilepath(filepath, type) {
  const missingExtension = !path.extname(filepath).length;

  if (!missingExtension) {
    return fs.existsSync(filepath) ? filepath : '';
  } else {
    let fp = resolveFilepathExtension(filepath, EXTENSIONS[type]);

    if (fp) {
      warn(WARN_MISSING_EXTENSION, getProjectPath(filepath));
      return fp;
    }

    fp = resolveFilepathExtension(path.join(filepath, 'index'), EXTENSIONS[type]);

    if (fp) {
      warn(WARN_PACKAGE_INDEX, getProjectPath(filepath));
    }

    return fp;
  }
}

/**
 * Resolve missing extension for 'filepath'
 * @param {string} filepath
 * @param {[string]} extensions
 * @returns {boolean}
 */
function resolveFilepathExtension(filepath, extensions) {
  for (const ext of extensions) {
    const fp = filepath + ext;

    if (fs.existsSync(fp)) {
      return fp;
    }
  }

  return '';
}
