import { getPackage, resolvePackagePath, resolvePackageSourcePath } from './package.js';
import { getPackageNameFromSpecifier, isSelfReferentialSpecifier } from './utils.js';
import { getProjectPath, resolveRealFilePath } from '../utils/file.js';
import { isAbsoluteFilePath, isBareSpecifier, isNodeModuleFilePath, isRelativeFilePath } from '../utils/is.js';
import fs from 'node:fs';
import { noisyWarn } from '../utils/log.js';
import path from 'node:path';

/** @type { Map<string, Package> } */
const packageCacheByImportDir = new Map();
/** @type { Map<string, Set<string>> } */
const packageVersionCacheByName = new Map();
/** @type { Map<string, Package> } */
const packageCacheByNameAndVersion = new Map();
/** @type { Map<string, string> } */
const resolveCache = new Map();

/**
 * Resolve absolute file path for "specifier" relative to "importer",
 * where "specifier" can be an absolute path, relative path, or npm package id
 *
 * @param { string } specifier
 * @param { string } [importer]
 * @param { 'browser' | 'node' } [env]
 * @returns { string | undefined }
 */
export function resolve(specifier, importer = 'index.js', env = 'browser') {
  if (!specifier) {
    return;
  }

  importer = path.resolve(importer);
  const key = getCacheKey(importer, specifier, env);
  const cached = resolveCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const filePath = doResolve(specifier, resolveRealFilePath(path.dirname(importer)), true, env);

  if (!filePath) {
    return;
  }

  resolveCache.set(key, filePath);
  return filePath;
}

/**
 * Retrieve Package instance for "dir"
 *
 * @param { string } dir
 * @param { 'browser' | 'node' } [env]
 * @returns { Package | undefined }
 */
export function getPackageForDir(dir, env = 'browser') {
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
 *
 * @param { string } specifier
 * @param { string } importerDirPath
 * @param { boolean } isEntry
 * @param { 'browser' | 'node' } env
 * @returns { string | undefined }
 */
function doResolve(specifier, importerDirPath, isEntry, env) {
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

  /** @type { string | undefined } */
  let filePath = resolvePackageSourcePath(
    isRelativeFilePath(specifier) ? path.join(importerDirPath, specifier) : specifier,
    pkg,
    verifyExports,
  );

  if (!filePath) {
    return;
  } else if (isAbsoluteFilePath(filePath)) {
    return resolveRealFilePath(filePath);
  } else if (!isBareSpecifier(filePath)) {
    // Unresolvable/non-standard format
    return;
  }

  // "filePath" must be a package reference (either the same or aliased),
  // so restart search from each package dir working upwards
  specifier = filePath;

  const packageName = /** @type { string } */ (getPackageNameFromSpecifier(specifier));
  const localPath = specifier.slice(packageName.length);

  for (const packageDirPath of pkg.paths) {
    const packagePath = path.join(packageDirPath, packageName);

    if (importerDirPath !== packageDirPath && fs.existsSync(packagePath)) {
      // Using full package + specifier here to account for nested package directories
      // (non-root directories with a package.json file)
      filePath = doResolve(specifier, path.join(resolveRealFilePath(packagePath), localPath), false, env);

      if (filePath) {
        return resolveRealFilePath(filePath);
      }
    }
  }
}

/**
 * Retrieve cache key
 *
 * @param { string } importerFilePath
 * @param { string } specifier
 * @param { 'browser' | 'node' } env
 * @returns { string }
 */
function getCacheKey(importerFilePath, specifier, env) {
  // Ensure that all packages imported by source files resolves to same key
  if (isBareSpecifier(specifier) && !isNodeModuleFilePath(importerFilePath)) {
    return `src:${specifier}:${env}`;
  }
  return `${getProjectPath(importerFilePath)}:${specifier}:${env}`;
}

/**
 * @param { string } dir
 * @param { 'browser' | 'node' } env
 * @returns { Package | undefined }
 */
function resolvePackage(dir, env) {
  let pkg = getPackageForDir(dir, env);

  // Version check (browser only)
  if (pkg && env === 'browser') {
    if (!packageVersionCacheByName.has(pkg.name)) {
      packageVersionCacheByName.set(pkg.name, new Set([pkg.version]));
    } else {
      const versions = /** @type { Set<string> } */ (packageVersionCacheByName.get(pkg.name));
      versions.add(pkg.version);

      if (versions.size > 1) {
        noisyWarn(`⚠️  multiple versions of the "${pkg.name}" package used: ${Array.from(versions).join(', ')}`);
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

/**
 * Clear caches
 */
export function clearResolverCache() {
  resolveCache.clear();
  packageCacheByImportDir.clear();
  packageCacheByNameAndVersion.clear();
  packageVersionCacheByName.clear();
}
