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

const IMPORT_EXTS = ['.js', '.mjs'];
const IMPORT_EXTS_TRANSPILER = ['.js', '.jsx', '.mjs', '.ts', '.tsx'];
// Sync with config.js#extensionsByType
const JS_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.jsx', '.js', '.json'];
const RE_TRANSPILER_HANDLES_SERVER = /\(\s?[a-zA-Z]+,\s?[a-zA-Z]+\s?\)/;

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
 * @param { Transpiler } [transpiler]
 * @returns { any }
 */
function importModule(modulePath, transpiler) {
  if (revertHook !== undefined) {
    revertHook();
  }

  revertHook = addHook(
    (code, filePath) => {
      // Determine if transpiler supports transpiling server modules by checking number of arguments (filePath, isServer) handled
      if (
        transpiler !== undefined &&
        RE_TRANSPILER_HANDLES_SERVER.test(transpiler.toString())
      ) {
        const transpiled = transpiler(filePath, true);

        if (transpiled !== undefined) {
          // Ignore async
          if (!(transpiled instanceof Promise)) {
            code = transpiled;
          }
        }
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
      exts: transpiler ? IMPORT_EXTS_TRANSPILER : IMPORT_EXTS,
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
