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

    const filePath = this.find(id, fromPath);

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
   * @param { string } fromPath
   * @returns { string | undefined }
   */
  find(id, fromPath) {
    const pkgPath = resolvePackagePath(fromPath);
    let pkg = this.packageCache.get(pkgPath);

    if (!pkg) {
      pkg = getPackage(fromPath, pkgPath);
      this.packageCache.set(pkgPath, pkg);
    }
    let filePath = isRelativeFilePath(id) ? path.join(fromPath, id) : id;

    // TODO: resolve alias
    if (filePath === false || builtinModules.includes(filePath)) {
      return;
    }

    if (isAbsoluteFilePath(filePath)) {
      filePath = find(getProjectPath(filePath), { type: 'js' });
      // TODO: resolve alias
      // File doesn't exist or is disabled
      if (!filePath || filePath === false) {
        return;
      }
      // File found
      if (isAbsoluteFilePath(filePath)) {
        return filePath;
      }
    }

    // Search package paths for matches
    pkg.paths.some((packagePath) => {
      if (fromPath !== packagePath) {
        let fp = path.join(packagePath, id);

        fp = this.find(fp, fp);
        if (fp) {
          filePath = fp;
          return true;
        }
        filePath = undefined;
      }
    });

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
