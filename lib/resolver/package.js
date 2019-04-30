'use strict';

const { find } = require('../utils/file.js');
const fs = require('fs');
const { maxFileSystemDepth } = require('../config.js');
const path = require('path');

const RE_TRAILING = /\/+$|\\+$/;

module.exports = {
  getPackage,
  resolvePackagePath
};

/**
 * Retrieve package details for "filePath"
 *
 * @param { string } filePath
 * @param { string } [packagePath]
 * @returns { object | undefined }
 */
function getPackage(filePath, packagePath = resolvePackagePath(filePath)) {
  if (packagePath === undefined || !fs.existsSync(packagePath)) {
    return;
  }

  const cwd = process.cwd();
  const manifestPath = path.join(packagePath, 'package.json');
  const paths = resolveNodeModules(packagePath);
  const isRoot = packagePath === cwd;
  const pkg = {
    aliases: {},
    isNodeModule: !isRoot,
    manifestPath,
    main: '',
    name: '',
    paths,
    path: packagePath
  };

  try {
    const json = require(manifestPath);

    pkg.name = json.name;
    pkg.main = find(json.main || 'index.js', {
      directories: [packagePath],
      type: 'js'
    });

    // Resolve browser aliasing
    if (json.browser) {
      if (typeof json.browser === 'string') {
        pkg.main = path.join(packagePath, json.browser);
      } else {
        // TODO parse aliases
        // Handle "main" aliasing
        for (const key in pkg.aliases) {
          if (key === pkg.main) {
            pkg.main = pkg.aliases[key];
            break;
          }
        }
      }
    }

    // Store "main" as alias
    if (pkg.main) {
      pkg.aliases[packagePath] = pkg.main;
      pkg.aliases[pkg.name] = pkg.main;
    }
  } catch (err) {
    // Not found
  }

  return pkg;
}

/**
 * Retrieve path to nearest directory with package.json for "filePath"
 *
 * @param { string } filePath
 * @returns { string }
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
    let depth = maxFileSystemDepth;
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
  let depth = maxFileSystemDepth;
  let parent;

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
