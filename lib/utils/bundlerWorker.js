'use strict';

// Force for bundling
const commonjs = require('rollup-plugin-commonjs/dist/rollup-plugin-commonjs.cjs.js');
const { isBareImport } = require('./is.js');
const json = require('rollup-plugin-json');
const path = require('path');
const resolve = require('rollup-plugin-node-resolve');
const { rollup } = require('rollup');

const ROLLUP_INPUT_DEFAULTS = {
  external: (id) => isBareImport(id),
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

const { resolveId: resolveMainModule } = ROLLUP_INPUT_DEFAULTS.plugins[0];

/**
 * Bundle package at 'id'
 * @param {string} id
 * @param {string} outputpath
 * @param {object} overrideOptions
 * @param {(err) => void} fn
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
  // inputOptions.plugins.unshift(virtual({ __entry__: fs.readFileSync(mainpath, 'utf8') }));

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
