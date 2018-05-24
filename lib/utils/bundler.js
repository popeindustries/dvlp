'use strict';

const { rollup } = require('rollup');
const fs = require('fs');
const path = require('path');
const rollupCommonjs = require('rollup-plugin-commonjs');
const rollupJson = require('rollup-plugin-json');
const rollupResolve = require('rollup-plugin-node-resolve');

const ROLLUP_INPUT_DEFAULTS = {
  plugins: [
    rollupResolve({
      browser: true
    }),
    rollupJson(),
    rollupCommonjs({
      sourceMap: false
    })
  ],
  treeshake: false
};
const ROLLUP_OUTPUT_DEFAULTS = {
  format: 'es',
  sourcemap: false
};

/**
 * Bundle package at 'id'
 * @param {string} id
 * @param {string} resolvedId
 * @param {string} filepath
 * @param {string} cachedir
 * @param {object} overrideOptions
 * @param {(err) => void} fn
 */
module.exports = async function bundle(id, resolvedId, filepath, cachedir, overrideOptions, fn) {
  overrideOptions = parseOptions(overrideOptions);
  const tmppath = path.join(cachedir, resolvedId).replace(path.extname(resolvedId), '.tmp');
  const inputOptions = { input: tmppath, ...ROLLUP_INPUT_DEFAULTS, ...overrideOptions.input };
  const outputOptions = { file: filepath, ...ROLLUP_OUTPUT_DEFAULTS, ...overrideOptions.output };

  // Rollup can only read from file
  fs.writeFileSync(tmppath, `export * from '${id}';\n`, 'utf8');

  try {
    const bundled = await rollup(inputOptions);
    await bundled.write(outputOptions);
  } catch (err) {
    fn(err);
  } finally {
    fs.unlinkSync(tmppath);
  }

  fn();
};

/**
 * Parse override options
 * @param {object} options
 * @returns {object}
 */
function parseOptions(options) {
  if (!options) {
    return { input: {}, output: {} };
  }

  const { input, treeshake, output = {}, watch, ...inputOverride } = options;
  const { format, sourcemap, ...outputOverride } = output;

  return { input: inputOverride, output: outputOverride };
}
