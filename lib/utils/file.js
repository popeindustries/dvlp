'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 */

const {
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isModule,
  isModuleBundlerFilePath
} = require('./is.js');
const {
  warn,
  WARN_MISSING_EXTENSION,
  WARN_PACKAGE_INDEX,
  WARN_SERVER_TRANSPILE
} = require('./log.js');
const { addHook } = require('pirates');
const config = require('../config.js');
const fs = require('fs');
const glob = require('glob');
// Work around rollup-plugin-commonjs dynamic require
const loadModule = require('module')._load;
const path = require('path');
const resolve = require('resolve').sync;
const sucrase = require('sucrase');
const { URL } = require('url');

const FILE_TYPES = ['html', 'js', 'css'];
const IMPORT_EXTS = ['.js', '.mjs'];
const IMPORT_EXTS_TRANSPILER = ['.js', '.jsx', '.mjs', '.ts', '.tsx'];
const RE_GLOB = /[*[{]/;
const RE_TRANSPILER_HANDLES_SERVER = /\(\s?[a-zA-Z]+,\s?[a-zA-Z]+\s?\)/;
const RE_SEPARATOR = /,\s?|\s|:|;/g;

module.exports = {
  exists,
  expandPath,
  find,
  getProjectPath,
  getTypeFromPath,
  getTypeFromRequest,
  importModule,
  resolveFrom
};

/**
 * Validate that all file paths exist
 *
 * @param { string | Array<string> } filePaths
 * @returns { void }
 */
function exists(filePaths) {
  if (!Array.isArray(filePaths)) {
    filePaths = [filePaths];
  }

  for (const filePath of filePaths) {
    if (!fs.existsSync(path.resolve(filePath))) {
      throw Error(`path '${filePath}' does not exist`);
    }
  }
}

/**
 * Expand 'filePath' into multiple filePaths
 * Handles globs and/or separators
 *
 * @param { string } filePath
 * @returns { Array<string> }
 */
function expandPath(filePath) {
  if (!filePath) {
    return;
  }

  if (Array.isArray(filePath)) {
    return filePath.reduce((filePaths, fp) => {
      if (fp) {
        filePaths.push(...expandPath(fp));
      }
      return filePaths;
    }, []);
  }

  RE_SEPARATOR.lastIndex = 0;
  if (RE_SEPARATOR.test(filePath)) {
    filePath = filePath.split(RE_SEPARATOR);
  }
  if (!Array.isArray(filePath)) {
    filePath = [filePath];
  }

  return filePath.reduce((filePaths, fp) => {
    if (RE_GLOB.test(fp)) {
      filePaths.push(...glob.sync(fp));
    } else {
      filePaths.push(fp);
    }
    return filePaths;
  }, []);
}

/**
 * Find filePath for 'req'
 *
 * @param { ClientRequest } req
 * @param { object } [options]
 * @param { Array<string> } [options.directories]
 * @param { string } [options.type]
 * @returns {string}
 */
function find(
  req,
  { directories = [process.cwd()], type = getTypeFromRequest(req) } = {}
) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname;
  let filePath;

  // Handle bundled js import
  if (isModuleBundlerFilePath(pathname)) {
    filePath = path.join(config.bundleDir, path.basename(pathname));
  } else {
    for (const directory of directories) {
      filePath = resolveFilePath(path.join(directory, pathname), type);

      if (filePath) {
        break;
      }
    }
  }

  if (filePath) {
    req.filePath = filePath;
    req.type = getTypeFromPath(filePath);
    return filePath;
  }

  throw Error(`file path for ${req.url} not found`);
}

/**
 * Import esm/cjs module, transpiling if necessary (via require hook)
 *
 * @param { string } modulePath
 * @param { (filePath: string, isServer: boolean) => Promise<string> | string | undefined } [transpiler]
 * @returns { object }
 */
function importModule(modulePath, transpiler) {
  // Determine if transpiler supports transpiling server modules by checking number of arguments (filePath, isServer) handled
  const hasServerTranspiler =
    transpiler && RE_TRANSPILER_HANDLES_SERVER.test(transpiler.toString());

  const revertHook = addHook(
    (code, filePath) => {
      if (hasServerTranspiler) {
        const transpiled = transpiler(filePath, true);

        if (transpiled) {
          // Ignore async
          if (transpiled instanceof Promise) {
            warn(WARN_SERVER_TRANSPILE);
          } else {
            code = transpiled;
          }
        }
      }

      if (!isModule(code)) {
        return code;
      }

      return sucrase.transform(code, {
        transforms: ['imports'],
        filePath
      }).code;
    },
    {
      exts: transpiler ? IMPORT_EXTS_TRANSPILER : IMPORT_EXTS,
      ignoreNodeModules: false
    }
  );
  let mod = loadModule(modulePath, module, false);

  // Return default if only exported key
  if ('default' in mod && Object.keys(mod).length === 1) {
    mod = mod.default;
  }

  revertHook();
  return mod;
}

/**
 * Retrieve the project relative path for 'filePath'
 *
 * @param { string } filePath
 * @returns { string }
 */
function getProjectPath(filePath) {
  return filePath === '/' ? filePath : path.relative(process.cwd(), filePath);
}

/**
 * Retrieve resource type
 *
 * @param { ClientRequest } req
 * @returns { string }
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
 * Retrieve generic file type from 'filePath' extension
 *
 * @param { string } filePath
 * @returns { string }
 */
function getTypeFromPath(filePath) {
  return config.typesByExtension[path.extname(filePath)];
}

/**
 * Resolve 'filePath' of 'type'
 * Handles missing extensions and package indexes
 *
 * @param { string } filePath
 * @param { string } type
 * @returns { boolean }
 */
function resolveFilePath(filePath, type) {
  const missingExtension = !path.extname(filePath).length;

  if (!missingExtension) {
    return fs.existsSync(filePath) ? filePath : '';
  }

  if (!type) {
    for (const t of FILE_TYPES) {
      const fp = resolveFilePath(filePath, t);

      if (fp) {
        return fp;
      }
    }
  }

  let fp = resolveFilePathExtension(filePath, config.extensionsByType[type]);

  if (fp) {
    warn(WARN_MISSING_EXTENSION, getProjectPath(filePath));
    return fp;
  }

  fp = resolveFilePathExtension(
    path.join(filePath, 'index'),
    config.extensionsByType[type]
  );

  if (fp && type === 'js') {
    warn(WARN_PACKAGE_INDEX, getProjectPath(filePath));
  }

  return fp;
}

/**
 * Resolve missing extension for 'filePath'
 *
 * @param { string } filePath
 * @param { Array<string> } extensions
 * @returns { boolean }
 */
function resolveFilePathExtension(filePath, extensions) {
  for (const ext of extensions) {
    const fp = filePath + ext;

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
    extensions: config.extensionsByType.js,
    pathFilter: (pkg, filePath, relativePath) => {
      // resolve doesn't support browser field map
      if (
        pkg.browser &&
        typeof pkg.browser === 'object' &&
        relativePath in pkg.browser
      ) {
        return pkg.browser[relativePath];
      }
      return relativePath;
    },
    packageFilter: (pkg) => {
      // resolve doesn't support paths with leading './'
      if (pkg.module !== undefined) {
        pkg.main = stripRelative(pkg.module);
      }
      if (pkg['jsnext:main'] !== undefined) {
        pkg.main = stripRelative(pkg['jsnext:main']);
      }
      if (pkg.main !== undefined) {
        pkg.main = stripRelative(pkg.main);
      }
      if (pkg.browser !== undefined) {
        if (typeof pkg.browser === 'string') {
          pkg.main = stripRelative(pkg.browser);
        } else {
          for (const f in pkg.browser) {
            pkg.browser[stripRelative(f)] = stripRelative(pkg.browser[f]);
          }
          if (pkg.main in pkg.browser) {
            pkg.main = pkg.browser[pkg.main];
          }
        }
      }

      return pkg;
    }
  });
}

/**
 * Clean 'filePath' of leading './'
 *
 * @param { string } filePath
 * @returns { string }
 */
function stripRelative(filePath) {
  return filePath.startsWith('./') ? filePath.slice(2) : filePath;
}
