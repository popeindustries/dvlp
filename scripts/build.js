import { bundleDts } from './bundle-dts.js';
import esbuild from 'esbuild';
import fs from 'fs';
import { minify } from 'terser';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const reloadClient = (
  await minify(fs.readFileSync('src/reload/reload-client.js', 'utf8'))
).code.replace(/(["\\])/g, '\\$1');
const mockClient = (
  await minify(fs.readFileSync('src/mock/mock-client.js', 'utf8'), {
    // Preserve 'cache' var for regex replacement
    mangle: { reserved: ['cache'] },
  })
).code.replace(/(["\\])/g, '\\$1');
const banner = {
  js: "import { createRequire as createRequireBecauseEsbuild } from 'module'; \nconst require = createRequireBecauseEsbuild(import.meta.url);",
};
const define = {
  'global.$RELOAD_CLIENT': `'${reloadClient}'`,
  'global.$MOCK_CLIENT': `"${mockClient}"`,
  'global.$VERSION': `'${pkg.version}'`,
};
const external = ['electron', 'esbuild', 'fsevents', 'dvlp/internal'];

bundleDts();

await esbuild.build({
  bundle: true,
  entryPoints: ['./src/dvlp-test-browser.ts'],
  format: 'esm',
  outfile: 'dvlp-test-browser.js',
  target: 'es2020',
});

await esbuild.build({
  banner,
  bundle: true,
  define,
  entryPoints: ['./src/dvlp-test.ts'],
  format: 'esm',
  outfile: 'dvlp-test.js',
  platform: 'node',
  target: 'node18',
});

await esbuild.build({
  banner,
  bundle: true,
  define,
  entryNames: '[name]',
  entryPoints: [
    './src/dvlp.ts',
    './src/dvlp-internal.ts',
    './src/application-host/application-worker.js',
    './src/electron-host/electron-worker.js',
  ],
  external,
  format: 'esm',
  outdir: '.',
  platform: 'node',
  splitting: false,
  target: 'node18',
});

await esbuild.build({
  bundle: true,
  entryNames: '[name]',
  entryPoints: ['./src/application-host/application-loader.js'],
  external,
  format: 'esm',
  splitting: false,
  target: 'node18',
  outdir: '.',
  platform: 'node',
  plugins: [
    // Replace `log.js` with dummy
    {
      name: 'dummylog',
      setup(build) {
        build.onLoad({ filter: /utils\/log\.(?:js|ts)$/ }, (args) => {
          return {
            contents: `
              export function error() {};
              export function noisyWarn() {};
              export function warn() {};
              export const WARN_MISSING_EXTENSION = '';
              export const WARN_PACKAGE_INDEX = '';
              `,
            loader: 'js',
          };
        });
      },
    },
  ],
});
