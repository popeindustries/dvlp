import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import config from '../config.js';
import { getPackageForDir } from '../resolver/index.js';
import { isJsFilePath } from './is.js';
import path from 'node:path';

/** @type { Record<string, string> } */
let meta = {};

if (existsSync(config.bundleDirMetaPath)) {
  meta = JSON.parse(readFileSync(config.bundleDirMetaPath, 'utf-8'));
}

process.on('exit', () => {
  if (!config.testing) {
    writeFileSync(config.bundleDirMetaPath, JSON.stringify(meta));
  }
});

/**
 * Get path to bundle from
 *
 * @param { string } specifier
 * @param { string } sourcePath
 */
export function getBundlePath(specifier, sourcePath) {
  const pkg = getPackageForDir(path.dirname(sourcePath));
  const bundleName = `${encodeBundleSpecifier(specifier)}-${
    pkg ? pkg.version : ''
  }.js`;
  const bundlePath = path.join(config.bundleDirName, bundleName);

  meta[bundleName] = sourcePath;

  return bundlePath;
}

/**
 * Get original source path from "bundlePath"
 *
 * @param { string } bundlePath
 * @returns [specifier: string, sourcePath: string]
 */
export function getBundleSourcePath(bundlePath) {
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
      } catch (err) {
        // ignore
      }
    }
  }
}

/**
 * Encode "id"
 *
 * @param { string } id
 */
function encodeBundleSpecifier(id) {
  return id.replace(/\//g, '__');
}

/**
 * Decode "id"
 *
 * @param { string } id
 */
function decodeBundleSpecifier(id) {
  return id.replace(/__/g, '/');
}
