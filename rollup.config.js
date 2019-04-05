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
const mockClient = terser
  .minify(fs.readFileSync('lib/mock/mock-client.js', 'utf8'))
  .code.replace(/'/g, "\\'");

module.exports = [
  {
    external: [...builtinModules],
    input: 'lib/bundler/bundle-worker.js',
    plugins: [commonjs(), resolve({ module: false }), json()],
    output: {
      file: 'bundle-worker.js',
      format: 'cjs'
    }
  },
  {
    external: [...builtinModules, 'worker-farm', 'fswatcher-child'],
    input: 'lib/index.js',
    plugins: [
      replace({
        'global.$RELOAD_CLIENT': `'${reloadClient}'`,
        'global.$MOCK_CLIENT': `'${mockClient}'`
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
  }
];
