import esbuild from 'esbuild';
import fs from 'fs';
import glob from 'fast-glob';
import { minify } from 'terser';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const reloadClient = (
  await minify(fs.readFileSync('src/reload/reload-client.js', 'utf8'))
).code;
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
let types = '';

for (const typePath of glob.sync('src/**/_.d.ts')) {
  types += `// ${typePath}\n${fs.readFileSync(
    path.resolve(typePath),
    'utf-8',
  )}\n`;
}

types = types.replace(
  /(declare) (interface|type|enum|namespace|function|class)/g,
  'export $2',
);

fs.writeFileSync(
  'dvlp.d.ts',
  `${fs.readFileSync('src/dvlp.d.ts', 'utf-8')}\n${types}`,
  'utf8',
);
fs.copyFileSync('src/dvlp-test.d.ts', 'dvlp-test.d.ts');
fs.copyFileSync('src/dvlp-test-browser.d.ts', 'dvlp-test-browser.d.ts');

await esbuild.build({
  bundle: true,
  entryPoints: ['./src/dvlp-test-browser.js'],
  format: 'esm',
  target: 'es2020',
  outfile: 'dvlp-test-browser.js',
});

await esbuild.build({
  banner,
  bundle: true,
  define,
  entryPoints: ['./src/dvlp-test.js'],
  format: 'esm',
  // Force keep dynamic import that has been back-ported to 12.2
  target: 'node13.2',
  platform: 'node',
  outfile: 'dvlp-test.js',
});

await esbuild.build({
  banner,
  bundle: true,
  define,
  entryNames: '[name]',
  entryPoints: [
    './src/dvlp.js',
    './src/application-host/application-worker.js',
  ],
  external: ['electron', 'esbuild', 'fsevents'],
  format: 'esm',
  splitting: false,
  // Force keep dynamic import that has been back-ported to 12.2
  target: 'node13.2',
  outdir: '.',
  platform: 'node',
});

await esbuild.build({
  bundle: true,
  define,
  entryNames: '[name]',
  entryPoints: ['./src/application-host/application-loader.js'],
  external: ['esbuild'],
  format: 'esm',
  splitting: false,
  // Force keep dynamic import that has been back-ported to 12.2
  target: 'node13.2',
  outdir: '.',
  platform: 'node',
  plugins: [
    // Replace `log.js` with dummy
    {
      name: 'dummylog',
      setup(build) {
        build.onLoad({ filter: /utils\/log.js$/ }, (args) => {
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
