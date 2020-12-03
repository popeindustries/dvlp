'use strict';

const { addHook } = require('pirates');
const path = require('path');
const { extensionsByType } = require('../config.js');

/** @type { () => void } */
let revertHook;

module.exports = {
  importModule,
};

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

  if (modulePath.startsWith('.')) {
    modulePath = path.resolve(modulePath);
  }

  let mod = require(modulePath);

  // Return default if only exported key
  if ('default' in mod && Object.keys(mod).length === 1) {
    mod = mod.default;
  }

  return mod;
}
