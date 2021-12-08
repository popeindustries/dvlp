import { find, resolveNodeModulesDirectories } from '../utils/file.js';
import {
  isAbsoluteFilePath,
  isBareSpecifier,
  isNodeModuleFilePath,
  isRelativeFilePath,
  isValidFilePath,
} from '../utils/is.js';
import { error } from '../utils/log.js';
import fs from 'fs';
import path from 'path';
import { resolve as resolveExports } from 'resolve.exports';

const MAX_FILE_SYSTEM_DEPTH = 10;
const RE_TRAILING = /\/+$|\\+$/;
const RESOLVE_IMPORTS_EXPORTS_CONFIG = { browser: true, conditions: ['development', 'dvlp'] };

/**
 * Retrieve package details for "filePath"
 *
 * @param { string } filePath
 * @param { string } [packagePath]
 * @returns { Package | undefined }
 */
export function getPackage(filePath, packagePath = resolvePackagePath(filePath)) {
  if (packagePath === undefined || !fs.existsSync(packagePath)) {
    return;
  }

  const manifestPath = path.join(packagePath, 'package.json');
  const isProjectPackage = packagePath === process.cwd();
  const paths = resolveNodeModulesDirectories(packagePath);
  /** @type { Package } */
  const pkg = {
    isProjectPackage,
    manifestPath,
    main: '',
    name: '',
    path: packagePath,
    paths,
    version: '',
  };
  const findOptions = {
    directories: [packagePath, ...pkg.paths],
    type: 'js',
  };

  try {
    const json = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const hasModuleField = json.module !== undefined;
    // Name is dirpath from nearest node_modules (even if not specified),
    // unless project package
    const name = resolvePackageName(json.name, packagePath, isProjectPackage);
    let main = find(json.module || json.main || 'index.js', findOptions);

    if (json.imports) {
      pkg.imports = parsePackageImports(json.imports);
    }
    if (json.exports) {
      pkg.exports = json.exports;
    } else if (json.browser) {
      pkg.browser = {};
      if (typeof json.browser === 'string') {
        // A "module" field takes precedence over aliases for "main" in "browser"
        if (!hasModuleField) {
          main = find(json.browser, findOptions);
        }
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
            if (key !== undefined && value !== undefined && key !== value) {
              // Illegal to overwrite "module" via "browser"
              if (!hasModuleField && key === main) {
                main = value;
              }
              pkg.browser[key] = value;
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
    // if (main) {
    //   pkg.aliases[packagePath] = main;
    //   pkg.aliases[json.name] = main;
    // }

    pkg.name = name;
    pkg.main = main;
    pkg.version = json.version;
  } catch (err) {
    // No package.json found
  }

  return pkg;
}

/**
 * Retrieve path to nearest directory with package.json for "filePath"
 *
 * @param { string } filePath
 * @returns { string | undefined }
 */
export function resolvePackagePath(filePath) {
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
    const pkgPath = path.join(dir, 'package.json');

    // Stop at directory with valid package.json
    if (fs.existsSync(pkgPath)) {
      if (!isNodeModule) {
        return dir;
      }

      // Some package.json files are used for scoping, side-effects, etc
      // Skip if no name or resolvable source
      try {
        const json = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        if (json.name || json.main || json.imports || json.exports || json.browser || json.module) {
          return dir;
        }
      } catch (err) {
        // Ignore
      }
    }

    parent = path.dirname(dir);

    // Stop if we hit root or max file system depth
    // Convert to lowercase to fix problems on Windows
    if (dir === root || !--depth || parent.toLowerCase() === dir.toLowerCase()) {
      break;
    }

    // Walk
    dir = parent;
  }
}

/**
 * Resolve path for "filePathOrSpecifier"
 *
 * @param { string } filePathOrSpecifier
 * @param { Package } pkg
 * @param { boolean } verifyExport
 * @returns { string | undefined }
 */
export function resolvePackageSourcePath(filePathOrSpecifier, pkg, verifyExport) {
  if (pkg.imports !== undefined && filePathOrSpecifier.startsWith('#')) {
    return resolveImportPath(filePathOrSpecifier, pkg);
  } else if (pkg.exports && verifyExport) {
    return resolveExportPath(filePathOrSpecifier, pkg);
  }

  filePathOrSpecifier = resolveMainOrBrowserPath(filePathOrSpecifier, pkg);

  // Missing file extension
  if (isAbsoluteFilePath(filePathOrSpecifier) && !isValidFilePath(filePathOrSpecifier)) {
    const foundFilePath = find(filePathOrSpecifier, { type: 'js' });

    if (!foundFilePath) {
      return;
    }

    return resolveMainOrBrowserPath(foundFilePath, pkg);
  }

  return filePathOrSpecifier;
}

/**
 *
 * @param { string } specifier
 * @param { Package } pkg
 */
export function resolveImportPath(specifier, pkg) {
  const entry = specifier.replace('#', './');

  try {
    const resolved = resolveExports({ name: pkg.name, exports: pkg.imports }, entry, RESOLVE_IMPORTS_EXPORTS_CONFIG);

    if (resolved) {
      return isBareSpecifier(resolved) ? resolved : path.resolve(pkg.path, resolved);
    }
  } catch (err) {
    if (/** @type { Error } */ (err).message.includes('Missing')) {
      error(
        `unable to resolve internal package reference. The ${pkg.name} package does not specify ${entry} in it's "imports" map.`,
      );
    }
  }
}

/**
 * Resolve export-mapped "filePathOrSpecifier"
 *
 * @param { string } filePathOrSpecifier
 * @param { Package } pkg
 */
function resolveExportPath(filePathOrSpecifier, pkg) {
  const entry = isBareSpecifier(filePathOrSpecifier)
    ? filePathOrSpecifier.replace(pkg.name, '.')
    : filePathOrSpecifier.replace(pkg.path, '.').replace(/\\/g, '/');

  try {
    const resolved = resolveExports(pkg, entry, RESOLVE_IMPORTS_EXPORTS_CONFIG);

    if (resolved) {
      return path.resolve(pkg.path, resolved);
    }
  } catch (err) {
    if (/** @type { Error } */ (err).message.includes('Missing')) {
      error(
        `unable to resolve package entry. The ${pkg.name} package does not specify ${entry} in it's "exports" map.`,
      );
    }
  }
}

/**
 * Resolve browser field alias for "filePath"
 *
 * @param { string } filePath
 * @param { Package } pkg
 * @returns { string }
 */
function resolveMainOrBrowserPath(filePath, pkg) {
  if (filePath === pkg.path && pkg.main) {
    return pkg.main;
  }

  if (pkg.browser) {
    // Follow chain of aliases
    // a => b; b => c; c => d
    while (filePath in pkg.browser) {
      filePath = pkg.browser[filePath];
    }
  }

  return filePath;
}

/**
 * Resolve package name
 *
 * @param { string | undefined } packageName
 * @param { string } packagePath
 * @param { boolean } isProjectPackage
 */
function resolvePackageName(packageName, packagePath, isProjectPackage) {
  let dir;

  if (!isNodeModuleFilePath(packagePath)) {
    if (isProjectPackage) {
      return packageName || 'project';
    }
    dir = process.cwd();
  } else {
    dir = packagePath.slice(0, packagePath.lastIndexOf('node_modules') + 12);
  }

  return path.relative(dir, packagePath).replace(/\\/g, '/');
}

/**
 * Replace all '#' prefixes to make compatible with resolve.exports
 *
 * @param { Record<string, string | Record<string, string>> } imports
 */
function parsePackageImports(imports) {
  /** @type { Record<string, string | Record<string, string>> } */
  const parsed = {};

  for (let key in imports) {
    const value = imports[key];

    if (key.startsWith('#')) {
      key = `./${key.slice(1)}`;
    }
    // @ts-ignore
    parsed[key] = typeof value === 'object' ? parsePackageImports(value) : value;
  }

  return parsed;
}
