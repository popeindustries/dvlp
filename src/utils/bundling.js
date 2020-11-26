'use strict';

const { isJsFilePath, isNodeModuleFilePath } = require('./is.js');
const config = require('../config.js');
const { existsSync, readdirSync, unlinkSync } = require('fs');
const { getCachedPackage } = require('../resolver/index.js');
const path = require('path');

const RE_SOURCE_PATH = /^\/\/ source: (.+)/;

module.exports = {
  cleanBundledFiles,
  decodeBundleId,
  encodeBundleId,
  parseOriginalBundledSourcePath,
  resolveBundleFileName,
};

/**
 * Retrieve original source path from bundled source code
 *
 * @param { string } code
 * @returns { string }
 */
function parseOriginalBundledSourcePath(code) {
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
function resolveBundleFileName(id, filePath) {
  if (!isNodeModuleFilePath(filePath)) {
    return '';
  }

  const pkg = getCachedPackage(path.dirname(filePath));

  return `${encodeBundleId(id)}-${pkg.version}.js`;
}

/**
 * Clear disk cache
 */
function cleanBundledFiles() {
  if (existsSync(config.bundleDir)) {
    for (const filePath of readdirSync(config.bundleDir).filter(isJsFilePath)) {
      unlinkSync(path.join(config.bundleDir, filePath));
    }
  }
}

/**
 * Encode "id"
 *
 * @param { string } id
 */
function encodeBundleId(id) {
  return id.replace(/\//g, '__');
}

/**
 * Decode "id"
 *
 * @param { string } id
 */
function decodeBundleId(id) {
  return id.replace(/__/g, '/');
}
