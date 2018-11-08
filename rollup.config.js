const commonjs = require('rollup-plugin-commonjs');
const json = require('rollup-plugin-json');
const resolve = require('rollup-plugin-node-resolve');

module.exports = {
  external: ['worker-farm', 'fswatcher-child', 'esm'],
  input: 'lib/index.js',
  plugins: [commonjs(), json(), resolve()],
  output: {
    file: 'dvlp.js',
    format: 'cjs'
  }
};
