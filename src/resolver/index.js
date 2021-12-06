import { getPackage, isSelfReferentialSpecifier, resolveAliasPath, resolvePackagePath } from './package.js';
import { getProjectPath, resolveRealFilePath } from '../utils/file.js';
import { isAbsoluteFilePath, isRelativeFilePath } from '../utils/is.js';
import path from 'path';
import { warn } from '../utils/log.js';

/** @type { Map<string, Package> } */
const packageCacheByImportDir = new Map();
/** @type { Map<string, Array<Package>> } */
const packageCacheByName = new Map();
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
 * @returns { string | undefined }
 */
export function resolve(specifier, importer = 'index.js') {
  if (!specifier) {
    return;
  }

  importer = path.resolve(importer);
  const key = `${getProjectPath(importer)}:${specifier}`;
  const cached = resolveCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const filePath = doResolve(key, specifier, path.dirname(importer), false);

  if (!filePath) {
    return;
  }

  resolveCache.set(key, filePath);
  return filePath;
}

/**
 * Retrieve file path for "specifier" relative to "importerDirPath"
 *
 * @param { string } key
 * @param { string } specifier
 * @param { string } importerDirPath
 * @param { boolean } verifyExports
 * @returns { string | undefined }
 */
function doResolve(key, specifier, importerDirPath, verifyExports) {
  const realImporterDirPath = resolveRealFilePath(importerDirPath);
  let [resolvedSpecifier, pkg] = resolveSpecifierAndPackage(specifier, realImporterDirPath);

  if (!pkg) {
    return;
  }

  /** @type { string | undefined } */
  let filePath = resolveAliasPath(
    isRelativeFilePath(resolvedSpecifier) ? path.join(realImporterDirPath, resolvedSpecifier) : resolvedSpecifier,
    pkg,
    // Verify exports map if not entry call, unless using self-referential import,
    // in which case exports map restrictions also apply
    verifyExports || isSelfReferentialSpecifier(resolvedSpecifier, pkg),
  );

  if (!filePath) {
    return;
  } else if (isAbsoluteFilePath(filePath)) {
    return resolveRealFilePath(filePath);
  }

  // "filePath" must be a package reference, so restart search from each package dir working upwards
  resolvedSpecifier = filePath;

  for (const packageDirPath of pkg.paths) {
    if (realImporterDirPath !== packageDirPath) {
      filePath = path.join(packageDirPath, resolvedSpecifier);
      filePath = doResolve(key, filePath, filePath, true);

      if (filePath) {
        return resolveRealFilePath(filePath);
      }
    }
  }
}

/**
 * Retrieve Package instance for "dir"
 *
 * @param { string } dir
 * @returns { Package | undefined }
 */
export function getPackageForDir(dir) {
  const pkgPath = resolvePackagePath(dir);

  if (!pkgPath) {
    return;
  }

  let pkg = packageCacheByImportDir.get(pkgPath);

  if (!pkg) {
    pkg = getPackage(dir, pkgPath);

    if (pkg) {
      packageCacheByImportDir.set(pkgPath, pkg);
    }
  }

  return pkg;
}

/**
 * @param { string } specifier
 * @param { string } dir
 * @returns { [specifier: string, pkg: Package | undefined]}
 */
function resolveSpecifierAndPackage(specifier, dir) {
  let pkg = getPackageForDir(dir);

  if (pkg) {
    if (!packageCacheByName.has(pkg.name)) {
      packageCacheByName.set(pkg.name, [pkg]);
    } else {
      const packages = /** @type { Array<Package> } */ (packageCacheByName.get(pkg.name));
      packages.push(pkg);

      warn(`⚠️  multiple versions of the "${pkg.name}" package used: ${packages.map((pkg) => pkg.version).join(', ')}`);
    }

    const versionedKey = `${pkg.name}@${pkg.version}`;
    const versionedPackage = packageCacheByNameAndVersion.get(versionedKey);

    // Use existing package at same version,
    // and modify specifier to resolve to existing package context
    if (versionedPackage) {
      specifier = specifier.replace(pkg.path, versionedPackage.path);
      pkg = versionedPackage;
    }

    packageCacheByNameAndVersion.set(versionedKey, pkg);
  }

  return [resolveRealFilePath(specifier), pkg];
}

/**
 * Clear caches
 */
export function clearResolverCache() {
  resolveCache.clear();
  packageCacheByImportDir.clear();
  packageCacheByNameAndVersion.clear();
}
