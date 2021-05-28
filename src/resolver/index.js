import { getPackage, resolveAliasPath, resolvePackagePath } from './package.js';
import { getProjectPath, resolveRealFilePath } from '../utils/file.js';
import { isAbsoluteFilePath, isRelativeFilePath } from '../utils/is.js';
import path from 'path';

/** @type { Map<string, string> } */
const resolveCache = new Map();
/** @type { Map<string, Package | undefined> } */
const packageCache = new Map();

/**
 * Resolve absolute file path for "specifier" relative to "importer",
 * where "specifier" can be an absolute path, relative path, or npm package id
 *
 * @param { string } specifier
 * @param { string } [importer]
 * @returns { string | undefined }
 */
export function resolve(specifier, importer = 'index.js') {
  if (!specifier) {
    return;
  }

  importer = path.resolve(importer);
  const key = getCacheKey(importer, specifier);

  if (resolveCache.has(key)) {
    return resolveCache.get(key);
  }

  const filePath = doResolve(specifier, path.dirname(importer));

  if (!filePath) {
    return;
  }

  resolveCache.set(key, filePath);
  return filePath;
}

/**
 * Retrieve file path for "specifier" relative to "importerDirPath"
 *
 * @param { string } specifier
 * @param { string } importerDirPath
 * @returns { string | undefined }
 */
function doResolve(specifier, importerDirPath) {
  const pkg = getCachedPackage(importerDirPath);

  if (!pkg) {
    return;
  }

  /** @type { string | undefined } */
  let filePath = resolveAliasPath(
    isRelativeFilePath(specifier) ? path.join(importerDirPath, specifier) : specifier,
    pkg,
  );

  if (!filePath) {
    return;
  } else if (isAbsoluteFilePath(filePath)) {
    return resolveRealFilePath(filePath);
  }

  // "filePath" must be a package reference, so restart search from each package dir working upwards
  specifier = filePath;

  for (const packageDirPath of pkg.paths) {
    if (importerDirPath !== packageDirPath) {
      filePath = path.join(packageDirPath, specifier);
      filePath = doResolve(filePath, filePath);

      if (filePath) {
        return resolveRealFilePath(filePath);
      }
    }
  }
}

/**
 * Retrieve cache key
 *
 * @param { string } importerFilePath
 * @param { string } specifier
 * @returns { string }
 */
function getCacheKey(importerFilePath, specifier) {
  return `${getProjectPath(importerFilePath)}:${specifier}`;
}

/**
 * Retrieve Package instance for "dir"
 *
 * @param { string } dir
 * @returns { Package | undefined }
 */
export function getCachedPackage(dir) {
  const pkgPath = resolvePackagePath(dir);

  if (!pkgPath) {
    return;
  }

  let pkg = packageCache.get(pkgPath);

  if (!pkg) {
    pkg = getPackage(dir, pkgPath);
    packageCache.set(pkgPath, pkg);
  }

  return pkg;
}

/**
 * Clear caches
 */
export function clearResolverCache() {
  resolveCache.clear();
  packageCache.clear();
}
