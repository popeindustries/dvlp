'use strict';

const { getPackage, resolveAliasPath, resolvePackagePath } = require('./package.js');
const { find, getProjectPath, resolveRealFilePath } = require('../utils/file.js');
const { isAbsoluteFilePath, isRelativeFilePath } = require('../utils/is.js');
const path = require('path');

const resolveCache = new Map();
const packageCache = new Map();

module.exports = {
  clearResolverCache,
  getCachedPackage,
  resolve,
};

/**
 * Resolve absolute file path for "specifier" relative to "importer",
 * where "specifier" can be an absolute path, relative path, or npm package id
 *
 * @param { string } specifier
 * @param { string } [importer]
 * @returns { string | undefined }
 */
function resolve(specifier, importer = 'index.js') {
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
 * Retrieve file path for "specifier" relative to "fromDirPath"
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

  const isIdRelative = isRelativeFilePath(specifier);

  // Handle self-referential package reference
  if (!isIdRelative && specifier.split('/')[0] === pkg.name) {
    specifier = path.join(pkg.path, specifier.replace(pkg.name, '.'));
  }

  /** @type { string | undefined } */
  let filePath = resolveAliasPath(isIdRelative ? path.join(importerDirPath, specifier) : specifier, pkg);

  if (isAbsoluteFilePath(filePath)) {
    // @ts-ignore
    filePath = resolveAliasPath(find(filePath, { type: 'js' }), pkg);

    // Allow package references to fall through (isAbsoluteFilePath ==> false)
    if (!filePath || isAbsoluteFilePath(filePath)) {
      return resolveRealFilePath(filePath);
    }
  }

  // filePath must be a package reference, so restart search from each package dir working upwards
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
 * @returns { Package }
 */
function getCachedPackage(dir) {
  const pkgPath = resolvePackagePath(dir);
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
function clearResolverCache() {
  resolveCache.clear();
  packageCache.clear();
}
