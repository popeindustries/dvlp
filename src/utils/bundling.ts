import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import config from '../config.ts';
import { getPackageForDir } from '../resolver/index.ts';
import { isJsFilePath } from './is.ts';
import path from 'node:path';

const { bundleDirMetaPath } = config;
let meta: Record<string, string> = {};

if (existsSync(bundleDirMetaPath)) {
  meta = JSON.parse(readFileSync(bundleDirMetaPath, 'utf-8'));
}

/**
 * Get path to bundle from
 */
export function getBundlePath(specifier: string, sourcePath: string) {
  const pkg = getPackageForDir(path.dirname(sourcePath));
  const bundleName = `${encodeBundleSpecifier(specifier)}-${
    pkg ? pkg.version : ''
  }.js`;
  const bundlePath = path.join(config.bundleDirName, bundleName);

  meta[bundleName] = sourcePath;

  writeFileSync(bundleDirMetaPath, JSON.stringify(meta));

  return bundlePath;
}

/**
 * Get original source path from "bundlePath"
 */
export function getBundleSourcePath(
  bundlePath: string,
): [specifier: string, sourcePath: string] {
  const bundleName = path.basename(bundlePath);
  const specifier = decodeBundleSpecifier(bundleName.split('-')[0]);
  const sourcePath = meta[bundleName];

  return [specifier, sourcePath];
}

/**
 * Clear disk cache
 */
export function cleanBundledFiles() {
  if (existsSync(config.bundleDirPath)) {
    for (const filePath of readdirSync(config.bundleDirPath).filter(
      isJsFilePath,
    )) {
      try {
        unlinkSync(path.join(config.bundleDirPath, filePath));
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Encode "id"
 */
function encodeBundleSpecifier(id: string) {
  return id.replace(/\//g, '__');
}

/**
 * Decode "id"
 */
function decodeBundleSpecifier(id: string) {
  return id.replace(/__/g, '/');
}
