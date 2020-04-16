'use strict';

/** @typedef { import("rollup").RollupOptions } RollupOptions */

const commonjsPlugin = require('@rollup/plugin-commonjs');
const jsonPlugin = require('@rollup/plugin-json');
const replacePlugin = require('@rollup/plugin-replace');
const resolvePlugin = require('@rollup/plugin-node-resolve');

/** @type { RollupOptions } */
module.exports = {
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
  output: {
    format: 'es',
    sourcemap: false,
  },
};
