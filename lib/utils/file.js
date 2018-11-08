'use strict';

const {
  extensionsByType,
  bundleDir,
  typesByExtension
} = require('../config.js');
const {
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isModuleBundlerFilepath
} = require('./is.js');
const {
  warn,
  WARN_MISSING_EXTENSION,
  WARN_PACKAGE_INDEX
} = require('./log.js');
const fs = require('fs');
const glob = require('glob');
// Work around rollup-plugin-commonjs dynamic require
const loadModule = require('module')._load;
const path = require('path');
const resolve = require('resolve').sync;
const { URL } = require('url');

const RE_GLOB = /[*[{]/;
const RE_SEPARATOR = /,\s?|\s|:|;/g;
const FILE_TYPES = ['html', 'js', 'css'];

module.exports = {
  exists,
  expandPath,
  find,
  getProjectPath,
  getTypeFromPath,
  importModule,
  resolveFrom
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
 * Expand 'filepath' into multiple filepaths
 * Handles globs and/or separators
 * @param {string} filepath
 * @returns {[string]}
 */
function expandPath(filepath) {
  if (!filepath) {
    return;
  }

  if (Array.isArray(filepath)) {
    return filepath.reduce((filepaths, fp) => {
      if (fp) {
        filepaths.push(...expandPath(fp));
      }
      return filepaths;
    }, []);
  }

  RE_SEPARATOR.lastIndex = 0;
  if (RE_SEPARATOR.test(filepath)) {
    filepath = filepath.split(RE_SEPARATOR);
  }
  if (!Array.isArray(filepath)) {
    filepath = [filepath];
  }

  return filepath.reduce((filepaths, fp) => {
    if (RE_GLOB.test(fp)) {
      filepaths.push(...glob.sync(fp));
    } else {
      filepaths.push(fp);
    }
    return filepaths;
  }, []);
}

/**
 * Find filepath for 'req'
 * @param {http.ClientRequest} req
 * @param {object} [options]
 *  - {[string]} [directories]
 *  - {string} [type]
 * @returns {string}
 */
function find(
  req,
  { directories = [process.cwd()], type = getTypeFromRequest(req) } = {}
) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname;
  let filepath;

  // Handle bundled js import
  if (isModuleBundlerFilepath(pathname)) {
    filepath = path.join(bundleDir, path.basename(pathname));
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
  try {
    return loadModule(modulepath, module, false);
  } catch (err) {
    console.log(err);
    //
  }
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
    for (const t of FILE_TYPES) {
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

  fp = resolveFilepathExtension(
    path.join(filepath, 'index'),
    extensionsByType[type]
  );

  if (fp && type === 'js') {
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

/**
 * Resolve package 'id' from 'dirpath'
 * @param {srtring} dirpath
 * @param {string} id
 * @returns {string}
 * @throws
 */
function resolveFrom(dirpath, id) {
  return resolve(id, {
    basedir: dirpath,
    extensions: extensionsByType.js,
    packageFilter: (pkg) => {
      if (pkg.module) {
        pkg.main = pkg.module;
      } else if (pkg['jsnext:main']) {
        pkg.main = pkg['jsnext:main'];
      }
      return pkg;
    }
  });
}
