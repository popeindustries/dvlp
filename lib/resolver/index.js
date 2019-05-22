'use strict';

const {
  getPackage,
  resolveAliasPath,
  resolvePackagePath
} = require('./package.js');
const { find, getProjectPath } = require('../utils/file.js');
const { isAbsoluteFilePath, isRelativeFilePath } = require('../utils/is.js');
const path = require('path');

const cache = new Map();
const packageCache = new Map();

module.exports = {
  clearResolverCache,
  getCachedPackage,
  resolve
};

/**
 * Resolve file path for "id" relative to "fromFilePath",
 * where "id" can be an absolute path, relative path, or npm package id
 *
 * @param { string } id
 * @param { string } [fromFilePath]
 * @returns { string | undefined }
 */
function resolve(id, fromFilePath = path.resolve('index.js')) {
  if (!id) {
    return;
  }

  const key = getCacheKey(fromFilePath, id);

  if (cache.has(key)) {
    return cache.get(key);
  }

  const filePath = _resolve(path.dirname(fromFilePath), id);

  if (!filePath) {
    return;
  }

  cache.set(key, filePath);
  return filePath;
}

/**
 * Retrieve file path for "id" relative to "fromDirPath"
 *
 * @param { string } fromDirPath
 * @param { string } id
 * @returns { string | undefined }
 */
function _resolve(fromDirPath, id) {
  const pkg = getCachedPackage(fromDirPath);

  if (!pkg) {
    return;
  }

  let filePath = resolveAliasPath(
    isRelativeFilePath(id) ? path.join(fromDirPath, id) : id,
    pkg
  );

  if (isAbsoluteFilePath(filePath)) {
    filePath = resolveAliasPath(find(filePath, { type: 'js' }), pkg);

    // Allow package references to fall through
    if (!filePath || isAbsoluteFilePath(filePath)) {
      return filePath;
    }
  }

  // filePath must be a package reference, so restart search from each package dir working upwards
  id = filePath;

  for (const packageDirPath of pkg.paths) {
    if (fromDirPath !== packageDirPath) {
      filePath = path.join(packageDirPath, id);
      filePath = _resolve(filePath, filePath);

      if (filePath) {
        return filePath;
      }
    }
  }
}

/**
 * Retrieve cache key
 *
 * @param { string } fromPath
 * @param { string } id
 * @returns { string }
 */
function getCacheKey(fromPath, id) {
  return `${getProjectPath(fromPath)}:${id}`;
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
  cache.clear();
  packageCache.clear();
}
