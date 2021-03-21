import { buildSync } from 'esbuild';
import fs from 'fs';
import path from 'path';
import pkg from '../package.json';
import terser from 'terser';

(async function build() {
  const reloadClient = (await terser.minify(fs.readFileSync('src/reloader/reload-client.js', 'utf8'))).code;
  const mockClient = (
    await terser.minify(fs.readFileSync('src/mock/mock-client.js', 'utf8'), {
      // Preserve 'cache' var for regex replacement
      mangle: { reserved: ['cache'] },
    })
  ).code.replace(/(["\\])/g, '\\$1');

  fs.writeFileSync(
    path.resolve('dvlp.d.ts'),
    fs.readFileSync(path.resolve('src/types.d.ts'), 'utf8').replace(/\/\*\s+export\s+\*\//g, 'export'),
  );

  buildSync({
    bundle: true,
    entryPoints: ['./src/test-browser/index.js'],
    format: 'esm',
    target: 'es2020',
    outfile: 'dvlp-browser.js',
  });

  buildSync({
    bundle: true,
    define: {
      'global.$RELOAD_CLIENT': `'${reloadClient}'`,
      'global.$MOCK_CLIENT': `"${mockClient}"`,
      'global.$VERSION': `'${pkg.version}'`,
    },
    entryPoints: ['./src/index.js'],
    external: ['esbuild', 'fsevents'],
    format: 'cjs',
    target: 'node12',
    platform: 'node',
    outfile: 'dvlp.js',
  });
})();
