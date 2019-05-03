'use strict';

/**
 * @typedef { object } Package
 * @property { object } aliases
 * @property { boolean } isNodeModule
 * @property { string } manifestPath
 * @property { string } main
 * @property { string } name
 * @property { string } path
 * @property { Array<string> } paths
 */

const { find } = require('../utils/file.js');
const { isRelativeFilePath } = require('../utils/is.js');
const fs = require('fs');
const path = require('path');

const MAX_FILE_SYSTEM_DEPTH = 10;
const RE_TRAILING = /\/+$|\\+$/;

module.exports = {
  getPackage,
  resolveAliasPath,
  resolvePackagePath
};

/**
 * Retrieve package details for "filePath"
 *
 * @param { string } filePath
 * @param { string } [packagePath]
 * @returns { Package | undefined }
 */
function getPackage(filePath, packagePath = resolvePackagePath(filePath)) {
  if (packagePath === undefined || !fs.existsSync(packagePath)) {
    return;
  }

  const manifestPath = path.join(packagePath, 'package.json');
  const pkg = {
    aliases: {},
    isNodeModule: packagePath !== process.cwd(),
    manifestPath,
    main: '',
    name: '',
    path: packagePath,
    paths: resolveNodeModules(packagePath),
    version: ''
  };

  try {
    const json = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const findOptions = {
      directories: [packagePath],
      type: 'js'
    };
    let main = find(json.module || json.main || 'index.js', findOptions);

    // Resolve "browser" aliasing
    if (json.browser) {
      if (typeof json.browser === 'string') {
        main = find(json.browser, findOptions);
      } else {
        for (let key in json.browser) {
          let value = json.browser[key];

          if (typeof value === 'string') {
            // If no extension, or not a relative path, it's a package reference
            if (path.extname(key) || isRelativeFilePath(key)) {
              key = find(key, findOptions);
            }
            if (path.extname(value) || isRelativeFilePath(value)) {
              value = find(value, findOptions);
            }

            if (key === main) {
              main = value;
            }
            pkg.aliases[key] = value;
          } else {
            // TODO: warn about disabled module?
          }
        }
      }
    }

    // Store "main" as alias
    if (main) {
      pkg.aliases[packagePath] = main;
      pkg.aliases[json.name] = main;
    }

    pkg.name = json.name;
    pkg.main = main;
    pkg.version = json.version;
  } catch (err) {
    // No package.json found
  }

  return pkg;
}

/**
 * Resolve alias for "filePath"
 *
 * @param { string } filePath
 * @param { Package } pkg
 * @returns { string }
 */
function resolveAliasPath(filePath, pkg) {
  // Follow chain of aliases
  // a => b; b => c; c => d
  while (filePath in pkg.aliases) {
    filePath = pkg.aliases[filePath];
  }

  return filePath;
}

/**
 * Retrieve path to nearest directory with package.json for "filePath"
 *
 * @param { string } filePath
 * @returns { string | undefined }
 */
function resolvePackagePath(filePath) {
  filePath = filePath.replace(RE_TRAILING, '');
  const cwd = process.cwd();
  const isNodeModules = filePath.includes('node_modules');

  if (isNodeModules) {
    const parts = filePath.split(path.sep);
    let idx = parts.lastIndexOf('node_modules');

    if (idx < parts.length - 1) {
      idx += 2;
    }
    // Handle scoped
    if (parts[idx - 1].charAt(0) == '@') {
      idx++;
    }

    const dir = parts.slice(0, idx).join(path.sep);

    return fs.existsSync(dir) ? dir : undefined;
  }

  // Find nearest directory with node_modules subdirectory
  if (filePath.includes(cwd)) {
    let depth = MAX_FILE_SYSTEM_DEPTH;
    let dir = filePath;
    let parent = '';

    while (true) {
      parent = path.dirname(dir);
      // Stop if we hit max file system depth or root
      // Convert to lowercase to fix problems on Windows
      if (!--depth || parent.toLowerCase() === dir.toLowerCase()) {
        break;
      }

      // Stop at nearest directory with node_modules or cwd
      if (dir == cwd || fs.existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }

      // Walk
      dir = parent;
    }
  }

  // Return project directory if file isn't a project file
  return cwd;
}

/**
 * Gather all node_modules directories reachable from "pkgPath"
 *
 * @param { string } pkgPath
 * @returns { Array<string> }
 */
function resolveNodeModules(pkgPath) {
  let dir = pkgPath;
  let dirs = [];
  let depth = MAX_FILE_SYSTEM_DEPTH;
  let parent;

  if (process.env.NODE_PATH !== undefined) {
    dirs = process.env.NODE_PATH.split(path.delimiter).map((dir) =>
      path.resolve(dir)
    );
  }

  while (true) {
    parent = path.dirname(dir);
    // Stop if we hit max file system depth or root
    // Convert to lowercase to fix problems on Windows
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

  return dirs;
}
