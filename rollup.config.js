const commonjs = require('@rollup/plugin-commonjs');
const fs = require('fs');
const json = require('@rollup/plugin-json');
const replace = require('@rollup/plugin-replace');
const resolve = require('@rollup/plugin-node-resolve');
const terser = require('terser');

const reloadClient = terser.minify(
  fs.readFileSync('lib/reloader/reload-client.js', 'utf8')
).code;
const mockClient = terser
  .minify(fs.readFileSync('lib/mock/mock-client.js', 'utf8'))
  .code.replace(/(["\\])/g, '\\$1');

function external(id) {
  return /^[^./\0]/.test(id);
}

module.exports = [
  {
    external,
    input: './lib/bundler/bundle-worker.js',
    plugins: [commonjs(), resolve(), json()],
    output: {
      file: 'bundle-worker.js',
      format: 'cjs'
    }
  },
  {
    external,
    input: './lib/index.js',
    plugins: [
      replace({
        'global.$RELOAD_CLIENT': `'${reloadClient}'`,
        'global.$MOCK_CLIENT': `"${mockClient}"`
      }),
      commonjs(),
      resolve(),
      json()
    ],
    output: {
      exports: 'named',
      file: 'dvlp.js',
      format: 'cjs'
    }
  }
];
