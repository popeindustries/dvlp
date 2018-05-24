'use strict';

const { rollup } = require('rollup');
const fs = require('fs');
const path = require('path');
const rollupResolve = require('rollup-plugin-node-resolve');
const rollupCommonjs = require('rollup-plugin-commonjs');

const ROLLUP_INPUT_DEFAULTS = {
  plugins: [
    rollupResolve({
      module: true,
      jsnext: true,
      main: true,
      browser: true
    }),
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
 * @param {(err) => void} fn
 */
module.exports = async function bundle(id, resolvedId, filepath, cachedir, fn) {
  const tmppath = path.join(cachedir, resolvedId).replace(path.extname(resolvedId), '.tmp');

  // Rollup can only read from file
  fs.writeFileSync(tmppath, `export * from '${id}';\n`, 'utf8');

  try {
    const bundled = await rollup({ input: tmppath, ...ROLLUP_INPUT_DEFAULTS });
    await bundled.write({ file: filepath, ...ROLLUP_OUTPUT_DEFAULTS });
  } catch (err) {
    fn(err);
  } finally {
    // fs.unlinkSync(tmppath);
  }

  fn();
};
