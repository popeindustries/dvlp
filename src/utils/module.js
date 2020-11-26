'use strict';

const { addHook } = require('pirates');
const fs = require('fs');
// @ts-ignore
const isModuleLib = require('is-module');
// Work around @rollup/plugin-commonjs dynamic require
// @ts-ignore
const loadModule = require('module')._load;
const path = require('path');
const { extensionsByType } = require('../config.js');

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
    extensionsByType.js.includes(path.extname(filePathOrCode))
  ) {
    filePathOrCode = fs.readFileSync(filePathOrCode, 'utf8');
  }
  return isModuleLib(filePathOrCode);
}

/**
 * Import esm/cjs module, transpiling if necessary (via require hook)
 *
 * @param { string } modulePath
 * @param { Hooks["onServerTransform"] } [onTransform]
 * @returns { any }
 */
function importModule(modulePath, onTransform) {
  if (revertHook !== undefined) {
    revertHook();
  }

  revertHook = addHook(
    (code, filePath) => {
      if (onTransform) {
        const transformed = onTransform(filePath, code);

        if (transformed !== undefined) {
          code = transformed;
        }
      }

      return code;
    },
    {
      exts: extensionsByType.js,
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
