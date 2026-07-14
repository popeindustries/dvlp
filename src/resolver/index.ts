import {
  getPackage,
  resolvePackagePath,
  resolvePackageSourcePath,
} from './package.ts';
import {
  getPackageNameFromSpecifier,
  isSelfReferentialSpecifier,
} from './utils.ts';
import { getProjectPath, resolveRealFilePath } from '../utils/file.ts';
import {
  isAbsoluteFilePath,
  isBareSpecifier,
  isNodeModuleFilePath,
  isRelativeFilePath,
} from '../utils/is.ts';
import type { Package, ResolveResult } from './types.ts';
import chalk from 'chalk';
import fs from 'node:fs';
import { noisyWarn } from '../utils/log.ts';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export { getPackage };

const packageCacheByImportDir: Map<string, Package> = new Map();
const packageVersionCacheByName: Map<string, Set<string>> = new Map();
const packageCacheByNameAndVersion: Map<string, Package> = new Map();
const resolveCache: Map<string, ResolveResult> = new Map();

/**
 * Resolve absolute file path for "specifier" relative to "importer",
 * where "specifier" can be an absolute path, relative path, or npm package id
 */
export function resolve(
  specifier: string,
  importer: string = 'index.js',
): string | undefined {
  if (!specifier) {
    return;
  }

  importer = path.resolve(importer);
  const key = getCacheKey(importer, specifier, 'browser');
  const cached = resolveCache.get(key);

  if (cached !== undefined) {
    return cached.filePath;
  }

  const result = doResolve(
    specifier,
    resolveRealFilePath(path.dirname(importer)),
    true,
    'browser',
  );

  if (result === undefined) {
    return;
  }

  resolveCache.set(key, result);
  return result.filePath;
}

/**
 * Resolve absolute file path for "specifier" relative to "importer",
 * where "specifier" can be an absolute path, relative path, or npm package id.
 * Return result includes file "format", if known.
 */
export function nodeResolve(
  specifier: string,
  importer: string = 'index.js',
): ResolveResult | undefined {
  if (!specifier) {
    return;
  }

  importer = path.resolve(importer);
  const key = getCacheKey(importer, specifier, 'node');
  const cached = resolveCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const result = doResolve(
    specifier,
    resolveRealFilePath(path.dirname(importer)),
    true,
    'node',
  );

  if (result === undefined) {
    return;
  }

  result.url = pathToFileURL(result.filePath).href;

  resolveCache.set(key, result);
  return result;
}

/**
 * Retrieve Package instance for "dir"
 */
export function getPackageForDir(
  dir: string,
  env: 'browser' | 'node' = 'browser',
): Package | undefined {
  const pkgPath = resolvePackagePath(dir);

  if (!pkgPath) {
    return;
  }

  const pkgKey = `${pkgPath}:${env}`;
  let pkg = packageCacheByImportDir.get(pkgKey);

  if (!pkg) {
    pkg = getPackage(dir, pkgPath, env);

    if (pkg) {
      packageCacheByImportDir.set(pkgKey, pkg);
    }
  }

  return pkg;
}

/**
 * Retrieve file path for "specifier" relative to "importerDirPath"
 */
function doResolve(
  specifier: string,
  importerDirPath: string,
  isEntry: boolean,
  env: 'browser' | 'node',
): ResolveResult | undefined {
  const pkg = resolvePackage(importerDirPath, env);

  if (!pkg) {
    return;
  }

  // Verify exports map if not entry call, unless using self-referential import,
  // in which case exports map restrictions also apply
  const verifyExports = !isEntry || isSelfReferentialSpecifier(specifier, pkg);

  // Re-write if resolving inside a package.
  // This relies upon correct pkg.name (see ./package.js#resolvePackageName)
  if (specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)) {
    specifier = specifier.replace(pkg.name, '.');
    importerDirPath = pkg.path;
  }

  let filePath: string | undefined = resolvePackageSourcePath(
    isRelativeFilePath(specifier)
      ? path.join(importerDirPath, specifier)
      : specifier,
    pkg,
    verifyExports,
  );

  if (!filePath) {
    return;
  } else if (isAbsoluteFilePath(filePath)) {
    filePath = resolveRealFilePath(filePath);
    return { filePath, format: resolveFileFormat(filePath, pkg) };
  } else if (!isBareSpecifier(filePath)) {
    // Unresolvable/non-standard format
    return;
  }

  // "filePath" must be a package reference (either the same or aliased),
  // so restart search from each package dir working upwards
  specifier = filePath;

  const packageName = getPackageNameFromSpecifier(specifier) as string;
  const localPath = specifier.slice(packageName.length);

  for (const packageDirPath of pkg.paths) {
    const packagePath = path.join(packageDirPath, packageName);

    if (importerDirPath !== packageDirPath && fs.existsSync(packagePath)) {
      // Using full package + specifier here to account for nested package directories
      // (non-root directories with a package.json file)
      const result = doResolve(
        specifier,
        path.join(resolveRealFilePath(packagePath), localPath),
        false,
        env,
      );

      if (result !== undefined) {
        return {
          filePath: resolveRealFilePath(result.filePath),
          format: result.format,
        };
      }
    }
  }
}

function getCacheKey(
  importerFilePath: string,
  specifier: string,
  env: 'browser' | 'node',
): string {
  // Ensure that all packages imported by source files resolves to same key
  if (isBareSpecifier(specifier) && !isNodeModuleFilePath(importerFilePath)) {
    return `src:${specifier}:${env}`;
  }
  return `${getProjectPath(importerFilePath)}:${specifier}:${env}`;
}

function resolvePackage(
  dir: string,
  env: 'browser' | 'node',
): Package | undefined {
  let pkg = getPackageForDir(dir, env);

  // Version check (browser only)
  if (pkg && env === 'browser') {
    if (!packageVersionCacheByName.has(pkg.name)) {
      packageVersionCacheByName.set(pkg.name, new Set([pkg.version]));
    } else {
      const versions = packageVersionCacheByName.get(pkg.name) as Set<string>;
      versions.add(pkg.version);

      if (versions.size > 1) {
        noisyWarn(
          `${chalk.yellow('⚠️')}  multiple versions of the "${
            pkg.name
          }" package used: ${Array.from(versions).join(', ')}`,
        );
      }
    }

    const versionedKey = `${pkg.name}@${pkg.version}`;
    const versionedPackage = packageCacheByNameAndVersion.get(versionedKey);

    // Use existing package at same version
    if (versionedPackage && versionedPackage !== pkg) {
      pkg = versionedPackage;
    }

    packageCacheByNameAndVersion.set(versionedKey, pkg);
  }

  return pkg;
}

function resolveFileFormat(
  filePath: string,
  pkg: Package,
): 'module' | 'commonjs' | undefined {
  const ext = path.extname(filePath);

  if (ext === '.mjs') {
    return 'module';
  } else if (ext === '.cjs') {
    return 'commonjs';
  } else {
    return pkg.type;
  }
}

/**
 * Clear caches
 */
export function clearResolverCache() {
  resolveCache.clear();
  packageCacheByImportDir.clear();
  packageCacheByNameAndVersion.clear();
  packageVersionCacheByName.clear();
}
