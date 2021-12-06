import { existsSync, readdirSync, unlinkSync } from 'fs';
import { isJsFilePath, isNodeModuleFilePath } from './is.js';
import config from '../config.js';
import { getPackageForDir } from '../resolver/index.js';
import path from 'path';

const RE_SOURCE_PATH = /^\/\/ source: (.+)/;
const SOURCE_PREFIX = '// source: ';

/**
 * Encode bundled source path in banner comment
 *
 * @param { string } sourcePath
 * @returns { string }
 */
export function encodeOriginalBundledSourcePath(sourcePath) {
  return `${SOURCE_PREFIX}${sourcePath}`;
}

/**
 * Retrieve original source path from bundled source code
 *
 * @param { string } code
 * @returns { string }
 */
export function parseOriginalBundledSourcePath(code) {
  const match = RE_SOURCE_PATH.exec(code);

  return match && match[1] ? match[1] : '';
}

/**
 * Resolve module id into bundle file name
 *
 * @param { string } id
 * @param { string } filePath
 * @returns { string }
 */
export function resolveBundleFileName(id, filePath) {
  if (!isNodeModuleFilePath(filePath)) {
    return '';
  }

  const pkg = getPackageForDir(path.dirname(filePath));

  return `${encodeBundleId(id)}-${pkg ? pkg.version : ''}.js`;
}

/**
 * Clear disk cache
 */
export function cleanBundledFiles() {
  if (existsSync(config.bundleDir)) {
    for (const filePath of readdirSync(config.bundleDir).filter(isJsFilePath)) {
      try {
        unlinkSync(path.join(config.bundleDir, filePath));
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
export function encodeBundleId(id) {
  return id.replace(/\//g, '__');
}

/**
 * Decode "id"
 *
 * @param { string } id
 */
export function decodeBundleId(id) {
  return id.replace(/__/g, '/');
}
