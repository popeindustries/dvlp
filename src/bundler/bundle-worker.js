'use strict';

/** @typedef { import("rollup").RollupOptions } RollupOptions */

const { rollup } = require('rollup');

/**
 * Bundle package at 'id'
 *
 * @param { string } inputPath
 * @param { string } outputPath
 * @param { string } sourcePrefix
 * @param { RollupOptions } rollupOptions
 * @param { (err?: Error) => void } fn
 * @returns { Promise<void> }
 */
module.exports = async function bundle(
  inputPath,
  outputPath,
  sourcePrefix,
  rollupOptions,
  fn,
) {
  const parsedOptions = parseOptions(sourcePrefix + inputPath, rollupOptions);
  const inputOptions = {
    ...parsedOptions.input,
    input: inputPath,
  };
  const outputOptions = {
    ...parsedOptions.output,
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
 * Parse Rollup options
 *
 * @param { string } banner
 * @param { RollupOptions } options
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
