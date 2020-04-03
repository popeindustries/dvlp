'use strict';

const {
  isAbsoluteFilePath,
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isModule,
  isModuleBundlerFilePath,
  isNodeModuleFilePath,
} = require('./is.js');
const {
  warn,
  WARN_MISSING_EXTENSION,
  WARN_PACKAGE_INDEX,
  WARN_SERVER_TRANSPILE,
} = require('./log.js');
const { addHook } = require('pirates');
const config = require('../config.js');
const favicon = require('./favicon.js');
const fs = require('fs');
const glob = require('glob');
// Work around @rollup/plugin-commonjs dynamic require
// @ts-ignore
const loadModule = require('module')._load;
const path = require('path');
const sucrase = require('sucrase');
const { URL } = require('url');

const FILE_TYPES = ['html', 'js', 'css'];
const IMPORT_EXTS = ['.js', '.mjs'];
const IMPORT_EXTS_TRANSPILER = ['.js', '.jsx', '.mjs', '.ts', '.tsx'];
const RE_GLOB = /[*[{]/;
const RE_TRANSPILER_HANDLES_SERVER = /\(\s?[a-zA-Z]+,\s?[a-zA-Z]+\s?\)/;
const RE_SEPARATOR = /[,;]\s?|\s/g;

/** @type { () => void } */
let revertHook;

module.exports = {
  exists,
  expandPath,
  favIcon: Buffer.from(favicon, 'base64'),
  find,
  getAbsoluteProjectPath,
  getProjectPath,
  getTypeFromPath,
  getTypeFromRequest,
  importModule,
  resolveRealFilePath,
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
 * Expand "filePath" into multiple filePaths
 * Handles globs and/or separators
 *
 * @param { string | Array<string> } filePath
 * @returns { Array<string> }
 */
function expandPath(filePath) {
  if (!filePath) {
    return [];
  }

  if (typeof filePath === 'string' && fs.existsSync(path.resolve(filePath))) {
    return [filePath];
  }

  if (Array.isArray(filePath)) {
    return filePath.reduce((/** @type { Array<string> } */ filePaths, fp) => {
      if (fp) {
        // @ts-ignore
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

  return filePath.reduce((/** @type { Array<string> } */ filePaths, fp) => {
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
 * @param { Req | string } req
 * @param { FindOptions } options
 * @returns { string | undefined }
 */
function find(req, { directories = config.directories, type } = {}) {
  const requestedFilePath = isRequestObject(req)
    ? new URL(req.url, 'http://localhost').pathname
    : req;
  let filePath;

  if (!type) {
    type = isRequestObject(req)
      ? getTypeFromRequest(req)
      : getTypeFromPath(req);
  }

  // Handle bundled js import
  if (isModuleBundlerFilePath(requestedFilePath)) {
    filePath = path.join(config.bundleDir, path.basename(requestedFilePath));
  } else if (isAbsoluteFilePath(requestedFilePath)) {
    filePath = resolveFilePath(requestedFilePath, type);
  } else {
    for (const directory of directories) {
      filePath = resolveFilePath(path.join(directory, requestedFilePath), type);

      if (filePath) {
        break;
      }
    }
  }

  if (!filePath) {
    return;
  }

  if (isRequestObject(req)) {
    req.filePath = filePath;
    req.type = getTypeFromPath(filePath);
  }

  return filePath;
}

/**
 * Import esm/cjs module, transpiling if necessary (via require hook)
 *
 * @param { string } modulePath
 * @param { Transpiler } [transpiler]
 * @returns { any }
 */
function importModule(modulePath, transpiler) {
  if (revertHook !== undefined) {
    revertHook();
  }

  revertHook = addHook(
    (code, filePath) => {
      // Determine if transpiler supports transpiling server modules by checking number of arguments (filePath, isServer) handled
      if (
        transpiler !== undefined &&
        RE_TRANSPILER_HANDLES_SERVER.test(transpiler.toString())
      ) {
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
        filePath,
      }).code;
    },
    {
      exts: transpiler ? IMPORT_EXTS_TRANSPILER : IMPORT_EXTS,
      ignoreNodeModules: false,
    },
  );
  let mod = loadModule(modulePath, module, false);

  // Return default if only exported key
  if ('default' in mod && Object.keys(mod).length === 1) {
    mod = mod.default;
  }

  return mod;
}

/**
 * Retrieve the project relative path for "filePath"
 *
 * @param { string | Array<string> } filePath
 * @returns { string }
 */
function getProjectPath(filePath) {
  if (Array.isArray(filePath)) {
    filePath = filePath[0];
  }

  const projectFilePath = isAbsoluteFilePath(filePath)
    ? path.relative(process.cwd(), filePath)
    : filePath;

  return projectFilePath.startsWith('/')
    ? projectFilePath.slice(1)
    : projectFilePath;
}

/**
 * Retrieve the absolute path for the project relative path "filePath"
 *
 * @param { string } filePath
 * @returns { string }
 */
function getAbsoluteProjectPath(filePath) {
  return isAbsoluteFilePath(filePath)
    ? filePath
    : path.join(
        process.cwd(),
        filePath.charAt(0) === '/' ? filePath.slice(1) : filePath,
      );
}

/**
 * Retrieve resource type
 *
 * @param { Req } req
 * @returns { string }
 */
function getTypeFromRequest(req) {
  // Unknown file types are sent with 'Accept: text/html',
  // so try JS/CSS before HTML
  if (req.type) {
    return req.type;
  } else if (isJsRequest(req)) {
    return 'js';
  } else if (isCssRequest(req)) {
    return 'css';
  } else if (isHtmlRequest(req)) {
    return 'html';
  } else {
    return '';
  }
}

/**
 * Retrieve generic file type from "filePath" extension
 *
 * @param { string } filePath
 * @returns { string }
 */
function getTypeFromPath(filePath) {
  return config.typesByExtension[path.extname(filePath)];
}

/**
 * Resolve "filePath" of "type"
 * Handles missing extensions and package indexes
 *
 * @param { string } filePath
 * @param { string } type
 * @returns { string }
 */
function resolveFilePath(filePath, type) {
  // prettier-ignore
  filePath = decodeURI(filePath).replace(/(\s)/g, '\$1'); // eslint-disable-line

  try {
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      return resolveRealFilePath(filePath);
    }
  } catch (err) {
    // Not found, possibly no extension or package
  }

  if (!type) {
    for (type of FILE_TYPES) {
      const fp = resolveFilePath(filePath, type);
      if (fp) {
        return resolveRealFilePath(fp);
      }
    }
  }

  let fp = resolveFilePathExtension(filePath, config.extensionsByType[type]);
  if (fp) {
    if (!isNodeModuleFilePath(fp)) {
      warn(WARN_MISSING_EXTENSION, getProjectPath(filePath));
    }
    return resolveRealFilePath(fp);
  }

  fp = resolveFilePathExtension(
    path.join(filePath, 'index'),
    config.extensionsByType[type],
  );

  if (fp && type === 'js') {
    if (!isNodeModuleFilePath(fp)) {
      warn(WARN_PACKAGE_INDEX, getProjectPath(filePath));
    }
  }

  return resolveRealFilePath(fp);
}

/**
 * Resolve missing extension for "filePath"
 *
 * @param { string } filePath
 * @param { Array<string> } extensions
 * @returns { string }
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
 * Resolve real path to "filePath", even if symlinked
 *
 * @param { string } filePath
 * @returns { string }
 */
function resolveRealFilePath(filePath) {
  if (!filePath) {
    return filePath;
  }

  try {
    return fs.realpathSync(filePath);
  } catch (err) {
    return filePath;
  }
}

/**
 * Determine whether "req" is a request object
 *
 * @param { unknown } req
 * @returns { req is Req }
 */
function isRequestObject(req) {
  return typeof req !== 'string';
}