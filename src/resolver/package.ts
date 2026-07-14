import { exports, imports } from 'resolve.exports';
import { find, resolveNodeModulesDirectories } from '../utils/file.ts';
import {
  isAbsoluteFilePath,
  isBareSpecifier,
  isNodeModuleFilePath,
  isRelativeFilePath,
  isValidFilePath,
} from '../utils/is.ts';
import { error } from '../utils/log.ts';
import type { FindOptions } from '../utils/types.ts';
import fs from 'node:fs';
import type { Package } from './types.ts';
import path from 'node:path';

const MAX_FILE_SYSTEM_DEPTH = 10;
const RE_TRAILING = /\/+$|\\+$/;

/**
 * Retrieve package details for "filePath"
 */
export function getPackage(
  filePath: string,
  packagePath: string | undefined = resolvePackagePath(filePath),
  env: 'browser' | 'node' = 'browser',
): Package | undefined {
  if (packagePath === undefined || !fs.existsSync(packagePath)) {
    return;
  }

  const manifestPath = path.join(packagePath, 'package.json');
  const isProjectPackage = packagePath === process.cwd();
  const paths = resolveNodeModulesDirectories(packagePath);
  const pkg: Package = {
    env,
    exportsConditions: [env, 'development', 'dvlp'],
    isProjectPackage,
    manifestPath,
    main: '',
    name: '',
    path: packagePath,
    paths,
    type: undefined,
    version: '',
  };
  const findOptions: FindOptions = {
    directories: [packagePath, ...pkg.paths],
    type: 'js',
  };

  try {
    const json = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const hasModuleField = json.module !== undefined;
    const type = hasModuleField ? 'module' : json.type;
    // Name is dirpath from nearest node_modules (even if not specified),
    // unless project package
    const name = resolvePackageName(json.name, packagePath);
    let main = find(json.module || json.main || 'index.js', findOptions);

    if (json.imports) {
      pkg.imports = json.imports;
    }
    if (json.exports) {
      pkg.exports = json.exports;
    } else if (env === 'browser' && json.browser) {
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
              // @ts-expect-error - non-null
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

    pkg.name = name;
    pkg.main = main;
    pkg.type = type;
    pkg.version = json.version;
  } catch {
    // No package.json found
  }

  return pkg;
}

/**
 * Retrieve path to nearest directory with package.json for "filePath"
 */
export function resolvePackagePath(filePath: string): string | undefined {
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

        if (
          json.name ||
          json.main ||
          json.imports ||
          json.exports ||
          json.browser ||
          json.module
        ) {
          return dir;
        }
      } catch {
        // Ignore
      }
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
 * Resolve path for "filePathOrSpecifier"
 */
export function resolvePackageSourcePath(
  filePathOrSpecifier: string,
  pkg: Package,
  verifyExport: boolean,
): string | undefined {
  if (pkg.imports !== undefined && filePathOrSpecifier.startsWith('#')) {
    return resolveImportPath(filePathOrSpecifier, pkg);
  } else if (pkg.exports && verifyExport) {
    let resolvedFilePath = resolveExportPath(filePathOrSpecifier, pkg);

    if (resolvedFilePath !== undefined && !fs.existsSync(resolvedFilePath)) {
      resolvedFilePath = find(resolvedFilePath, { type: 'js' });
    }

    return resolvedFilePath;
  }

  filePathOrSpecifier = resolveMainOrBrowserPath(filePathOrSpecifier, pkg);

  // Missing file extension
  if (
    isAbsoluteFilePath(filePathOrSpecifier) &&
    !isValidFilePath(filePathOrSpecifier)
  ) {
    const foundFilePath = find(filePathOrSpecifier, { type: 'js' });

    if (!foundFilePath) {
      return;
    }

    return resolveMainOrBrowserPath(foundFilePath, pkg);
  }

  return filePathOrSpecifier;
}

export function resolveImportPath(specifier: string, pkg: Package) {
  try {
    const resolved = imports(
      { name: pkg.name, imports: pkg.imports },
      specifier,
      {
        // `node` automatically added if not set
        browser: pkg.env === 'browser',
        conditions: pkg.exportsConditions,
      },
    );

    if (resolved?.length) {
      return isBareSpecifier(resolved[0])
        ? resolved[0]
        : path.resolve(pkg.path, resolved[0]);
    }
  } catch (err) {
    if ((err as Error).message.includes('Missing')) {
      error(
        `unable to resolve internal package reference. The ${pkg.name} package does not specify ${specifier} in it's "imports" map.`,
      );
    }
  }
}

/**
 * Resolve export-mapped "filePathOrSpecifier"
 */
function resolveExportPath(filePathOrSpecifier: string, pkg: Package) {
  const entry = filePathOrSpecifier.replace(
    isBareSpecifier(filePathOrSpecifier) ? pkg.name : pkg.path,
    '.',
  );

  try {
    const resolved = exports(pkg, entry.replace(/\\/g, '/'), {
      // `node` automatically added if not set
      browser: pkg.env === 'browser',
      conditions: pkg.exportsConditions,
    });

    if (resolved?.length) {
      return path.resolve(pkg.path, resolved[0]);
    }
  } catch (err) {
    if ((err as Error).message.includes('Missing')) {
      error(
        `unable to resolve package entry. The ${pkg.name} package does not specify ${entry} in it's "exports" map.`,
      );
    }
  }
}

/**
 * Resolve browser field alias for "filePath"
 */
function resolveMainOrBrowserPath(filePath: string, pkg: Package): string {
  let resolved = filePath;

  if (filePath === pkg.path && pkg.main) {
    resolved = pkg.main;
  }

  if (pkg.browser) {
    // Follow chain of aliases
    // a => b; b => c; c => d
    while (resolved in pkg.browser) {
      resolved = pkg.browser[resolved];
    }
  }

  return resolved;
}

/**
 * Resolve package name
 */
function resolvePackageName(
  packageName: string | undefined,
  packagePath: string,
) {
  if (!isNodeModuleFilePath(packagePath)) {
    return packageName || 'project';
  }

  return path
    .relative(
      packagePath.slice(0, packagePath.lastIndexOf('node_modules') + 12),
      packagePath,
    )
    .replace(/\\/g, '/');
}
