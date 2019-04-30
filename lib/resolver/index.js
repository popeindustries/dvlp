'use strict';

const { getPackage, resolvePackagePath } = require('./package.js');
const {
  find,
  getProjectPath,
  isAbsoluteFilePath,
  // isFilePath,
  isRelativeFilePath
} = require('../utils/file.js');
const { builtinModules } = require('module');
const path = require('path');

module.exports = class Resolver {
  /**
   * Constructor
   */
  constructor() {
    this.cache = new Map();
    this.packageCache = new Map();
  }

  /**
   * Resolve file path for "id"
   *
   * @param { string } fromPath
   * @param { string } id
   * @returns { string | undefined }
   */
  resolve(fromPath, id) {
    const key = this.getCacheKey(fromPath, id);

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const filePath = this.find(id, path.dirname(fromPath));

    if (!filePath) {
      return;
    }

    this.cache.set(key, filePath);
    return filePath;
  }

  /**
   * Retrieve file path for "id"
   *
   * @param { string } id
   * @param { string } fromDirPath
   * @returns { string | undefined }
   */
  find(id, fromDirPath) {
    const pkgPath = resolvePackagePath(fromDirPath);

    if (!pkgPath) {
      return;
    }

    let pkg = this.packageCache.get(pkgPath);
    if (!pkg) {
      pkg = getPackage(fromDirPath, pkgPath);
      this.packageCache.set(pkgPath, pkg);
    }
    let filePath = isRelativeFilePath(id) ? path.join(fromDirPath, id) : id;

    if (filePath in pkg.aliases) {
      filePath = pkg.aliases[filePath];
    }
    if (filePath === false || builtinModules.includes(filePath)) {
      return;
    }

    if (isAbsoluteFilePath(filePath)) {
      filePath = find(filePath, { type: 'js' });
      if (filePath in pkg.aliases) {
        filePath = pkg.aliases[filePath];
      }
      // File doesn't exist or is disabled (false)
      // TODO: this fails if alias returns new package name
      if (!filePath) {
        filePath = undefined;
      }
    } else {
      id = filePath;

      // Search package paths for matches
      for (const packageDirPath of pkg.paths) {
        if (fromDirPath !== packageDirPath) {
          filePath = path.join(packageDirPath, id);
          filePath = this.find(filePath, filePath);

          if (filePath) {
            break;
          }
        }
      }
    }

    return filePath;
  }

  /**
   * Retrieve cache key
   *
   * @param { string } fromPath
   * @param { string } id
   * @returns { string }
   */
  getCacheKey(fromPath, id) {
    return `${getProjectPath(fromPath)}:${id}`;
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.cache.clear();
    this.packageCache.clear();
  }
};
