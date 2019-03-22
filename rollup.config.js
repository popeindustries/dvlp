const { builtinModules } = require('module');
const commonjs = require('rollup-plugin-commonjs');
const json = require('rollup-plugin-json');
const resolve = require('rollup-plugin-node-resolve');

module.exports = {
  external: [...builtinModules, 'worker-farm', 'fswatcher-child', 'esm'],
  input: 'lib/index.js',
  // Fix error with rollup resolving of acorn by ignoring 'module'
  plugins: [commonjs(), resolve({ module: false }), json()],
  output: {
    file: 'dvlp.js',
    format: 'cjs'
  }
};
