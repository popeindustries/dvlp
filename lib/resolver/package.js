'use strict';

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
  const isNodeModule = packagePath !== process.cwd();
  const paths = resolveNodeModules(packagePath);
  /** @type { Package } */
  const pkg = {
    aliases: {},
    isNodeModule,
    manifestPath,
    main: '',
    name: '',
    path: packagePath,
    paths,
    version: ''
  };
  const findOptions = {
    directories: [packagePath, ...pkg.paths],
    type: 'js'
  };

  try {
    const json = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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
              // @ts-ignore
              key = find(key, findOptions);
            }
            if (path.extname(value) || isRelativeFilePath(value)) {
              value = find(value, findOptions);
            }

            if (key !== undefined && value !== undefined) {
              if (key === main) {
                main = value;
              }
              pkg.aliases[key] = value;
            } else {
              // TODO: warn unable to resolve
            }
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
  const isNodeModule = filePath.includes('node_modules');
  let depth = MAX_FILE_SYSTEM_DEPTH;
  let dir = filePath;
  let parent = '';
  let root = cwd;

  // Set root to first node_modules dir if in node_modules
  if (isNodeModule) {
    const parts = filePath.split(path.sep);
    const idx = parts.indexOf('node_modules');

    root = parts.slice(0, idx + 1).join(path.sep);
  }

  while (true) {
    // Stop at directory with package.json
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }

    parent = path.dirname(dir);

    // Stop if we hit root or max file system depth
    // Convert to lowercase to fix problems on Windows
    if (
      dir === root ||
      !--depth ||
      parent.toLowerCase() === dir.toLowerCase()
    ) {
      break;
    }

    // Walk
    dir = parent;
  }
}

/**
 * Gather all node_modules directories reachable from "pkgPath"
 *
 * @param { string } pkgPath
 * @returns { Array<string> }
 */
function resolveNodeModules(pkgPath) {
  let dir = pkgPath;
  /** @type { Array<string> } */
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
