'use strict';

const commonjsPlugin = require('@rollup/plugin-commonjs');
const jsonPlugin = require('@rollup/plugin-json');
const replacePlugin = require('@rollup/plugin-replace');
let resolvePlugin = require('@rollup/plugin-node-resolve');

if ('default' in resolvePlugin) {
  // @ts-ignore
  resolvePlugin = resolvePlugin.default;
}

const plugins = [
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
];

/**
 * Retrieve the default Rollup-config
 * @returns { import("rollup").RollupOptions }
 */
exports.getDefaultRollupConfig = function getDefaultRollupConfig() {
  return {
    // Only bundle local package files
    external: (id, parent, isResolved) => {
      // Skip if already handled by plugin
      if (isResolved || (parent && parent.includes('?commonjs-proxy'))) {
        return false;
      }
      return /^[^./\0]/.test(id);
    },
    plugins: plugins.slice(),
    treeshake: false,
    output: {
      format: 'es',
      sourcemap: false,
    },
  };
};
