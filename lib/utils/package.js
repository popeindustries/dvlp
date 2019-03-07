'use strict';

// const { find } = require('./file.js');
const fs = require('fs');
const { maxFileSystemDepth } = require('../config.js');
const path = require('path');

const RE_TRAILING = /\/+$|\\+$/g;

const cache = new Map();

export function findPackage(filePath) {
  const pkgDir = resolvePackageDir(filePath);
  const pkgPath = path.join(pkgDir, 'package.json');

  if (cache.has(pkgPath)) {
    return cache.get(pkgPath);
  }

  const cwd = process.cwd();
  const npmPaths = resolveNodeModules(pkgPath);
  const pkg = {
    dir: pkgDir,
    isNpmPackage: pkgDir !== cwd,
    main: '',
    name: '',
    npmPaths,
    path: pkgPath,
    version: '0.0.0'
  };

  if (fs.existsSync(pkgPath)) {
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    pkg.name = json.name;
    pkg.version = json.version;
  }

  cache.set(pkgPath, pkg);

  return pkg;
}

/**
 * Resolve path to nearest package.json from 'filePath'
 *
 * @param { string } filePath
 * @returns { string }
 */
function resolvePackageDir(filePath) {
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
