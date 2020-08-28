'use strict';

const { addHook } = require('pirates');
const fs = require('fs');
// @ts-ignore
const isModuleLib = require('is-module');
// Work around @rollup/plugin-commonjs dynamic require
// @ts-ignore
const loadModule = require('module')._load;
const path = require('path');
const sucrase = require('sucrase');

const IMPORT_EXTS = ['.js', '.jsx', '.mjs', '.ts', '.tsx'];
// Sync with config.js#extensionsByType
const JS_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.jsx', '.js', '.json'];

/** @type { () => void } */
let revertHook;

module.exports = {
  isModule,
  importModule,
};

/**
 * Determine if filePath or code is es module
 *
 * @param { string } filePathOrCode
 * @returns { boolean }
 */
function isModule(filePathOrCode) {
  if (
    !filePathOrCode.includes('\n') &&
    JS_EXTENSIONS.includes(path.extname(filePathOrCode))
  ) {
    filePathOrCode = fs.readFileSync(filePathOrCode, 'utf8');
  }
  return isModuleLib(filePathOrCode);
}

/**
 * Import esm/cjs module, transpiling if necessary (via require hook)
 *
 * @param { string } modulePath
 * @param { (filePath: string) => string | undefined } transform
 * @returns { any }
 */
function importModule(modulePath, transform = (filePath) => undefined) {
  if (revertHook !== undefined) {
    revertHook();
  }

  revertHook = addHook(
    (code, filePath) => {
      const transformed = transform(filePath);

      if (transformed !== undefined) {
        code = transformed;
      }

      if (!isModule(code)) {
        return code;
      }

      return sucrase.transform(code, {
        transforms: ['imports'],
        filePath,
      }).code;
    },
    {
      exts: IMPORT_EXTS,
      ignoreNodeModules: false,
    },
  );
  let mod = loadModule(modulePath, module, false);

  // Return default if only exported key
  if ('default' in mod && Object.keys(mod).length === 1) {
    mod = mod.default;
  }

  return mod;
}
