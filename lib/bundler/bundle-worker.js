'use strict';

const commonjs = require('rollup-plugin-commonjs');
const json = require('rollup-plugin-json');
const path = require('path');
const replace = require('rollup-plugin-replace');
const resolve = require('rollup-plugin-node-resolve');
const { rollup } = require('rollup');

const ROLLUP_INPUT_DEFAULTS = {
  // Only bundle local package files
  external: (id) => /^[^./]/.test(id),
  plugins: [
    replace({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"` || '"development"'
    }),
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

const { resolveId: resolveMainModule } = ROLLUP_INPUT_DEFAULTS.plugins[1];

/**
 * Bundle package at 'id'
 *
 * @param { string } id
 * @param { string } outputpath
 * @param { object } overrideOptions
 * @param { (err: Error) => void } fn
 */
module.exports = async function bundle(id, outputpath, overrideOptions, fn) {
  overrideOptions = parseOptions(overrideOptions);
  const input = await resolveMainModule(id, path.resolve('index.js'));
  const inputOptions = {
    input,
    ...ROLLUP_INPUT_DEFAULTS,
    ...overrideOptions.input
  };
  const outputOptions = {
    file: outputpath,
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
