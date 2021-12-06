import { existsSync, readdirSync, unlinkSync } from 'fs';
import { isAbsoluteFilePath, isJsFilePath } from './is.js';
import config from '../config.js';
import path from 'path';

/**
 * Encode bundle "filePath"
 *
 * @param { string } id
 * @param { string } filePath
 */
export function encodeBundleFilePath(id, filePath) {
  const idAndFilePath = encodeURIComponent(`${id}##${filePath}`.replace(/\\/g, '/'));
  return `${path.join(config.bundleDirName, idAndFilePath)}`.replace(/\\/g, '/');
}

/**
 * Decode bundle "id" and "filePath"
 *
 * @param { string } encodedBundleFilePath
 * @returns { [id: string, filePath: string] }
 */
export function decodeBundleFilePath(encodedBundleFilePath) {
  if (!isAbsoluteFilePath(encodedBundleFilePath)) {
    encodedBundleFilePath = path.resolve(encodedBundleFilePath);
  }
  encodedBundleFilePath = decodeURIComponent(path.relative(config.bundleDir, encodedBundleFilePath));

  const [id, filePath] = encodedBundleFilePath.split('##');

  return [id, path.resolve(config.bundleDir, filePath)];
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
