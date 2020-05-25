const commonjs = require('@rollup/plugin-commonjs');
const fs = require('fs');
const json = require('@rollup/plugin-json');
const path = require('path');
const replace = require('@rollup/plugin-replace');
const resolve = require('@rollup/plugin-node-resolve').default;
const terser = require('terser');

const reloadClient = terser.minify(
  fs.readFileSync('src/reloader/reload-client.js', 'utf8'),
).code;
const mockClient = terser
  .minify(fs.readFileSync('src/mock/mock-client.js', 'utf8'))
  .code.replace(/(["\\])/g, '\\$1');

fs.writeFileSync(
  path.resolve('dvlp.d.ts'),
  fs
    .readFileSync(path.resolve('src/types.d.ts'), 'utf8')
    .replace(/\/\*\s+export\s+\*\//g, 'export'),
);
fs.copyFileSync(
  path.resolve('src/test-browser/index.js'),
  path.resolve('dvlp-browser.js'),
);

module.exports = [
  {
    external: (id) => /^[^./\0]/.test(id),
    input: './src/bundler/bundle-worker.js',
    plugins: [commonjs(), resolve(), json()],
    output: {
      file: 'bundle-worker.js',
      format: 'cjs',
    },
  },
  {
    external: (id) => id.includes('bundle-worker') || /^[^./\0]/.test(id),
    input: './src/index.js',
    plugins: [
      replace({
        'global.$RELOAD_CLIENT': `'${reloadClient}'`,
        'global.$MOCK_CLIENT': `"${mockClient}"`,
      }),
      commonjs(),
      resolve(),
      json(),
    ],
    output: {
      exports: 'named',
      file: 'dvlp.js',
      format: 'cjs',
      paths: {
        [path.resolve('src/bundler/bundle-worker.js')]: './bundle-worker.js',
      },
    },
  },
];
