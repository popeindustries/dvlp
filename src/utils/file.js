import {
  isAbsoluteFilePath,
  isBundledUrl,
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isNodeModuleFilePath,
} from './is.js';
import { warn, WARN_MISSING_EXTENSION, WARN_PACKAGE_INDEX } from './log.js';
import config from '../config.js';
import fs from 'node:fs';
import { parse } from 'es-module-lexer';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FILE_TYPES = ['js', 'css', 'html'];
const MAX_FILE_SYSTEM_DEPTH = 10;

/** @type { Map<string, 'cjs' | 'esm'> } */
const fileFormatCache = new Map();
const realPath =
  'native' in fs.realpathSync && typeof fs.realpathSync.native === 'function'
    ? fs.realpathSync.native
    : fs.realpathSync;

/**
 * Validate that all file paths exist
 *
 * @param { string | Array<string> } filePaths
 * @returns { void }
 */
export function exists(filePaths) {
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
 * Find filePath for 'req'
 *
 * @param { Req | string } req
 * @param { FindOptions } options
 * @returns { string | undefined }
 */
export function find(req, { directories = config.directories, type } = {}) {
  const href = decodeURI(
    isRequestObject(req) ? new URL(req.url, 'http://localhost').pathname : req,
  );
  let filePath;

  if (!type) {
    type = isRequestObject(req)
      ? getTypeFromRequest(req)
      : getTypeFromPath(req);
  }

  // Special handling for '/node_modules...' to allow breaking out of cwd.
  // This is similar to how Node resolves package names internally.
  if (href.startsWith('/node_modules')) {
    directories = [
      ...directories,
      ...resolveNodeModulesDirectories(process.cwd()).map(
        (nodeModulesDirPath) => path.dirname(nodeModulesDirPath),
      ),
    ];
  }

  // Handle bundled js import
  if (isBundledUrl(href)) {
    // Remove leading "/"
    filePath = path.resolve(href.slice(1));
  } else if (isAbsoluteFilePath(href)) {
    filePath = resolveFilePath(href, type);
  } else {
    for (const directory of directories) {
      filePath = resolveFilePath(path.join(directory, href), type);

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
 * Walk parent directories looking for first file with matching "fileName"
 * @param { string } fileName
 * @returns { string | undefined }
 */
export function findClosest(fileName) {
  let dir = path.resolve(fileName);
  let depth = MAX_FILE_SYSTEM_DEPTH;
  let parent;

  while (true) {
    parent = path.dirname(dir);
    // Stop if we hit max file system depth or root
    // Convert to lowercase to avoid problems on Windows
    if (!--depth || parent.toLowerCase() === dir.toLowerCase()) {
      break;
    }

    const filePath = path.resolve(dir, fileName);

    if (fs.existsSync(filePath)) {
      return filePath;
    }

    // Walk
    dir = parent;
  }
}

/**
 * Retrieve the project relative path for "filePath"
 *
 * @param { string | Array<string> } filePath
 * @returns { string }
 */
export function getProjectPath(filePath) {
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
export function getAbsoluteProjectPath(filePath) {
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
export function getTypeFromRequest(req) {
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
 * @returns { 'css' | 'html' | 'js' }
 */
export function getTypeFromPath(filePath) {
  return config.typesByExtension[path.extname(filePath)];
}

/**
 * Get directory contents of path
 *
 * @param { string } dirPath
 * @returns { Array<string> }
 */
export function getDirectoryContents(dirPath) {
  if (fs.statSync(dirPath).isFile()) {
    return [dirPath];
  }

  return fs
    .readdirSync(dirPath)
    .map((filePath) => path.resolve(dirPath, filePath));
}

/**
 * Import module at 'filePath'
 *
 * @template ModuleType
 * @param { string } filePath
 * @returns { Promise<ModuleType> }
 */
export async function importModule(filePath) {
  /** @type { ModuleType } */ // @ts-ignore
  let module = await import(pathToFileURL(filePath));

  if (module && 'default' in module) {
    // @ts-ignore
    module = module.default;
  }

  return module;
}

/**
 * Determine if 'filePath' is referencing an esm file
 *
 * @param { string } filePath
 * @param { Package } [pkg]
 * @returns { boolean }
 */
export function isEsmFile(filePath, pkg) {
  const cached = fileFormatCache.get(filePath);

  if (cached !== undefined) {
    return cached === 'esm';
  }

  const extension = path.extname(filePath);
  let isEsm = false;

  if (extension === '.js') {
    if (pkg?.type === 'module') {
      isEsm = true;
    }

    if (!isEsm) {
      try {
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const [imports, exports] = parse(fileContents);
        isEsm = imports.length > 0 || exports.length > 0;
      } catch (err) {
        isEsm = false;
      }
    }
  } else if (extension === '.mjs') {
    isEsm = true;
  }

  fileFormatCache.set(filePath, isEsm ? 'esm' : 'cjs');

  return isEsm;
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
    // Not found, possibly no extension, no package, or wrong extension.
    // If unable to resolve a file that has an extension,
    // we will ignore the existing extension and try all others.
    // Since TypeScript allows adding ".js" to imports, but resolves to ".ts" files,
    // this will allow us to resolve to a ".ts" file when looking for a (missing) ".js" one.
  }

  if (!type) {
    for (type of FILE_TYPES) {
      const fp = resolveFilePath(filePath, type);
      if (fp) {
        return resolveRealFilePath(fp);
      }
    }
  }

  const hasExtension = path.extname(filePath) !== '';
  let fp = resolveFilePathExtension(filePath, config.extensionsByType[type]);

  if (fp) {
    // Skip warning if original extension provided, even though it's invalid (TypeScript .js -> .ts)
    if (!hasExtension && !isNodeModuleFilePath(fp)) {
      warn(WARN_MISSING_EXTENSION, `"${getProjectPath(filePath)}"`);
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
  const ext = path.extname(filePath);

  if (ext && extensions.includes(ext)) {
    filePath = filePath.replace(ext, '');
  }

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
export function resolveRealFilePath(filePath) {
  if (!filePath || !path.isAbsolute(filePath)) {
    return filePath;
  }

  try {
    return realPath(filePath);
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

/**
 * Gather all node_modules directories reachable from "filePath"
 *
 * @param { string } filePath
 * @returns { Array<string> }
 */
export function resolveNodeModulesDirectories(filePath) {
  let dir = path.extname(filePath) ? path.dirname(filePath) : filePath;
  /** @type { Array<string> } */
  let dirs = [];
  let depth = MAX_FILE_SYSTEM_DEPTH;
  let parent;

  while (true) {
    parent = path.dirname(dir);
    // Stop if we hit max file system depth or root
    // Convert to lowercase to avoid problems on Windows
    if (!--depth || parent.toLowerCase() === dir.toLowerCase()) {
      break;
    }

    const nodeModulesPath = path.resolve(dir, 'node_modules');

    if (fs.existsSync(nodeModulesPath)) {
      dirs.push(nodeModulesPath);
    }

    // Walk
    dir = parent;
  }

  return dirs.sort((a, b) => (a.length >= b.length ? -1 : 1));
}
