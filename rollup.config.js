const { builtinModules } = require('module');
const commonjs = require('rollup-plugin-commonjs');
const fs = require('fs');
const json = require('rollup-plugin-json');
const replace = require('rollup-plugin-replace');
const resolve = require('rollup-plugin-node-resolve');
const terser = require('terser');

const reloadClient = terser.minify(
  fs.readFileSync('lib/reloader/reload-client.js', 'utf8')
).code;

module.exports = {
  external: [...builtinModules, 'worker-farm', 'fswatcher-child'],
  input: 'lib/index.js',
  plugins: [
    replace({
      'global.$RELOAD_CLIENT': `'${reloadClient}'`
    }),
    commonjs(),
    // Fix error with rollup resolving of acorn by ignoring 'module'
    resolve({ module: false }),
    json()
  ],
  output: {
    file: 'dvlp.js',
    format: 'cjs'
  }
};
