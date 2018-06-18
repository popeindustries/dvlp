'use strict';

const { rollup } = require('rollup');
const commonjs = require('rollup-plugin-commonjs');
const json = require('rollup-plugin-json');
const resolve = require('rollup-plugin-node-resolve');
const virtual = require('rollup-plugin-virtual');

const ROLLUP_INPUT_DEFAULTS = {
  plugins: [
    resolve({
      browser: true
    }),
    json(),
    commonjs({
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
 * @param {string} filepath
 * @param {object} overrideOptions
 * @param {(err) => void} fn
 */
module.exports = async function bundle(id, filepath, overrideOptions, fn) {
  overrideOptions = parseOptions(overrideOptions);
  const inputOptions = { input: '__entry__', ...ROLLUP_INPUT_DEFAULTS, ...overrideOptions.input };
  const outputOptions = { file: filepath, ...ROLLUP_OUTPUT_DEFAULTS, ...overrideOptions.output };

  inputOptions.plugins.unshift(virtual({ __entry__: `export * from '${id}';\n` }));

  try {
    const bundled = await rollup(inputOptions);
    await bundled.write(outputOptions);
    fn();
  } catch (err) {
    fn(err);
  }
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
  const { file, format, sourcemap, ...outputOverride } = output;

  return { input: inputOverride, output: outputOverride };
}
