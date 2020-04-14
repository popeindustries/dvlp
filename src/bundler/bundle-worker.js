'use strict';

const commonjsPlugin = require('@rollup/plugin-commonjs');
const jsonPlugin = require('@rollup/plugin-json');
const replacePlugin = require('@rollup/plugin-replace');
const resolvePlugin = require('@rollup/plugin-node-resolve');
const { rollup } = require('rollup');

/** @typedef { import("rollup").InputOptions } InputOptions */
/** @typedef { import("rollup").OutputOptions } OutputOptions */
/** @typedef { import("rollup").RollupOptions } RollupOptions */

/** @type { InputOptions } */
const ROLLUP_INPUT_DEFAULTS = {
  // Only bundle local package files
  external: (id, parent, isResolved) => {
    // Skip if already handled by plugin
    if (isResolved || (parent && parent.includes('?commonjs-proxy'))) {
      return false;
    }
    return /^[^./\0]/.test(id);
  },
  plugins: [
    // @ts-ignore
    replacePlugin({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"` || '"development"',
    }),
    // @ts-ignore
    resolvePlugin({
      mainFields: ['browser', 'module', 'main'],
    }),
    // @ts-ignore
    jsonPlugin(),
    // @ts-ignore
    commonjsPlugin({
      sourceMap: false,
    }),
  ],
  treeshake: false,
};
/** @type { OutputOptions } */
const ROLLUP_OUTPUT_DEFAULTS = {
  format: 'es',
  sourcemap: false,
};

/**
 * Bundle package at 'id'
 *
 * @param { string } inputPath
 * @param { string } outputPath
 * @param { string } sourcePrefix
 * @param { RollupOptions } [overrideOptions]
 * @param { (err?: Error) => void } fn
 * @returns { Promise<void> }
 */
module.exports = async function bundle(
  inputPath,
  outputPath,
  sourcePrefix,
  overrideOptions,
  fn,
) {
  const parsedOverrideOptions = parseOptions(
    sourcePrefix + inputPath,
    overrideOptions,
  );
  const inputOptions = {
    ...ROLLUP_INPUT_DEFAULTS,
    ...parsedOverrideOptions.input,
    input: inputPath,
  };
  const outputOptions = {
    ...ROLLUP_OUTPUT_DEFAULTS,
    ...parsedOverrideOptions.output,
    file: outputPath,
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
 * @param { string } banner
 * @param { RollupOptions } [options]
 * @returns { { input: object, output: object } }
 */
function parseOptions(banner, options) {
  if (!options) {
    return { input: {}, output: { banner } };
  }

  const { input, treeshake, output = {}, watch, ...inputOverride } = options;
  // @ts-ignore
  const { file, format, sourcemap, ...outputOverride } = output;

  if ('banner' in outputOverride) {
    outputOverride.banner = banner + outputOverride.banner;
  } else {
    // @ts-ignore
    outputOverride.banner = banner;
  }

  return { input: inputOverride, output: outputOverride };
}
