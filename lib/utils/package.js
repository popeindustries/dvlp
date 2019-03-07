'use strict';

const fs = require('fs');
const { maxFileSystemDepth } = require('../config.js');
const path = require('path');

const RE_TRAILING = /\/+$|\\+$/g;

const cache = new Map();

export function findPackage(filePath) {
  if (cache.has(filePath)) {
    return cache.get(filePath);
  }

  const cwd = process.cwd();
  const pkgPath = resolvePackagePath(filePath);
  const paths = resolveNodeModules(pkgPath);
  const manifestPath = path.resolve(pkgPath, 'package.json');
  const pkg = {
    dirname: path.dirname(pkgPath),
    isNpmPackage: pkgPath !== cwd,
    manifestPath,
    main: '',
    paths,
    pkgPath
  };

  cache.set(filePath, pkg);

  return pkg;
}

/**
 * Resolve path to nearest package.json from 'filePath'
 *
 * @param { string } filePath
 * @returns { string }
 */
function resolvePackagePath(filePath) {
  filePath = filePath.replace(RE_TRAILING, '');
  const cwd = process.cwd();
  const isNpmPackage = filePath.includes('node_modules');

  // Find nearest node_modules directory
  if (isNpmPackage) {
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

    // Installed packages must have manifest, otherwise continue
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }

  // Find nearest directory with node_modules subdirectory
  if (filePath.includes(cwd)) {
    let depth = maxFileSystemDepth;
    let dir = filePath;

    while (true) {
      const parent = path.dirname(dir);

      // Stop if we hit max file system depth or root
      // Convert to lowercase to fix problems on Windows
      if (!--depth || parent.toLowerCase() === dir.toLowerCase()) {
        break;
      }

      // Stop at nearest directory with node_modules or cwd
      if (dir == cwd || fs.existsSync(path.resolve(dir, 'node_modules'))) {
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
 * Gather all node_modules directories reachable from 'pkgPath'
 *
 * @param { string } pkgPath
 * @returns { Array<string> }
 */
function resolveNodeModules(pkgPath) {
  const dirs = [];
  let dir = pkgPath;
  let depth = maxFileSystemDepth;

  while (true) {
    const parent = path.dirname(dir);

    // Stop if we hit max file system depth or root
    // Convert to lowercase to fix problems on Windows
    if (!--depth || parent.toLowerCase() === dir.toLowerCase()) {
      break;
    }

    const nodeModulespath = path.resolve(dir, 'node_modules');

    if (fs.existsSync(nodeModulespath)) {
      dirs.push(nodeModulespath);
    }

    // Walk
    dir = parent;
  }

  return dirs;
}
