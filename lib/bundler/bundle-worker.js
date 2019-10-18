'use strict';

const commonjsPlugin = require('rollup-plugin-commonjs');
const jsonPlugin = require('rollup-plugin-json');
const replacePlugin = require('rollup-plugin-replace');
const resolvePlugin = require('rollup-plugin-node-resolve');
const { rollup } = require('rollup');

const ROLLUP_INPUT_DEFAULTS = {
  // Only bundle local package files
  external: (id, parent, isResolved) => {
    // Skip if already handled by plugin
    if (isResolved || parent.includes('?commonjs-proxy')) {
      return false;
    }
    return /^[^./\0]/.test(id);
  },
  plugins: [
    replacePlugin({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"` || '"development"'
    }),
    resolvePlugin({
      mainFields: ['browser', 'module', 'main']
    }),
    jsonPlugin(),
    commonjsPlugin({
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
 *
 * @param { string } inputPath
 * @param { string } outputPath
 * @param { object } overrideOptions
 * @param { (err: Error) => void } fn
 */
module.exports = async function bundle(
  inputPath,
  outputPath,
  overrideOptions,
  fn
) {
  overrideOptions = parseOptions(overrideOptions);

  const inputOptions = {
    input: inputPath,
    ...ROLLUP_INPUT_DEFAULTS,
    ...overrideOptions.input
  };
  const outputOptions = {
    file: outputPath,
    ...ROLLUP_OUTPUT_DEFAULTS,
    ...overrideOptions.output
  };

  try {
    const bundled = await rollup(inputOptions);
    await bundled.write(outputOptions);
    fn();
  } catch (err) {
    console.log(err);
    fn(err);
  }
};

/**
 * Parse override options
 *
 * @param { object } options
 * @returns { object }
 */
function parseOptions(options) {
  if (!options) {
    return { input: {}, output: {} };
  }

  const { input, treeshake, output = {}, watch, ...inputOverride } = options;
  const { file, format, sourcemap, ...outputOverride } = output;

  return { input: inputOverride, output: outputOverride };
}
