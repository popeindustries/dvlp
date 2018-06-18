'use strict';

const { extensionsByType, moduleCacheDir, typesByExtension } = require('../config');
const fs = require('fs');
const {
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isModuleBundlerFilepath,
  isNodeModuleFilepath
} = require('./is');
const path = require('path');
const requireModule = require('esm')({});
const { URL } = require('url');
const { warn, WARN_MISSING_EXTENSION, WARN_PACKAGE_INDEX } = require('./log');

const originalReadStreamRead = fs.ReadStream.prototype._read;
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

module.exports = {
  exists,
  find,
  getProjectPath,
  getTypeFromPath,
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
 * @param {object} [options]
 *  - {[string]} [directories]
 *  - {string} [type]
 * @returns {string}
 */
function find(req, { directories = [process.cwd()], type = getTypeFromRequest(req) } = {}) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname;
  let filepath;

  // Handle bare js import
  if (isModuleBundlerFilepath(pathname)) {
    filepath = path.join(moduleCacheDir, path.basename(pathname));
  } else {
    for (const directory of directories) {
      filepath = resolveFilepath(path.join(directory, pathname), type);

      if (filepath) {
        break;
      }
    }
  }

  if (filepath) {
    req.filepath = filepath;
    req.type = getTypeFromPath(filepath);
    return filepath;
  }

  throw Error(`filepath for ${req.url} not found`);
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
  if (filepath.includes(cwd) && !isNodeModuleFilepath(filepath)) {
    fn(filepath);
  }
}

/**
 * Retrieve resource type
 * @param {http.ClientRequest} req
 * @returns {string}
 */
function getTypeFromRequest(req) {
  if (req.type) {
    return req.type;
  } else if (isHtmlRequest(req)) {
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
 * Retrieve generic file type from 'filepath' extension
 * @param {string} filepath
 * @returns {string}
 */
function getTypeFromPath(filepath) {
  return typesByExtension[path.extname(filepath)];
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
  }

  if (!type) {
    for (const t of ['html', 'js', 'css']) {
      const fp = resolveFilepath(filepath, t);

      if (fp) {
        return fp;
      }
    }
  }

  let fp = resolveFilepathExtension(filepath, extensionsByType[type]);

  if (fp) {
    warn(WARN_MISSING_EXTENSION, getProjectPath(filepath));
    return fp;
  }

  fp = resolveFilepathExtension(path.join(filepath, 'index'), extensionsByType[type]);

  if (fp) {
    warn(WARN_PACKAGE_INDEX, getProjectPath(filepath));
  }

  return fp;
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
