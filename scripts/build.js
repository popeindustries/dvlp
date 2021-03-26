import { build } from 'esbuild';
import fs from 'fs';
import { minify } from 'terser';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

(async function main() {
  const reloadClient = (await minify(fs.readFileSync('src/reloader/reload-client.js', 'utf8'))).code;
  const mockClient = (
    await minify(fs.readFileSync('src/mock/mock-client.js', 'utf8'), {
      // Preserve 'cache' var for regex replacement
      mangle: { reserved: ['cache'] },
    })
  ).code.replace(/(["\\])/g, '\\$1');

  fs.writeFileSync(
    path.resolve('dvlp.d.ts'),
    fs.readFileSync(path.resolve('src/types.d.ts'), 'utf8').replace(/\/\*\s+export\s+\*\//g, 'export'),
  );

  await build({
    bundle: true,
    entryPoints: ['./src/test-browser/index.js'],
    format: 'esm',
    target: 'es2020',
    outfile: 'dvlp-browser.js',
  });

  await build({
    banner: {
      js:
        "import { createRequire as createRequireBecauseEsbuild } from 'module'; \nconst require = createRequireBecauseEsbuild(import.meta.url);",
    },
    bundle: true,
    define: {
      'global.$RELOAD_CLIENT': `'${reloadClient}'`,
      'global.$MOCK_CLIENT': `"${mockClient}"`,
      'global.$VERSION': `'${pkg.version}'`,
    },
    entryPoints: ['./src/index.js'],
    external: ['esbuild', 'fsevents'],
    format: 'esm',
    target: 'node12',
    platform: 'node',
    outfile: 'dvlp.js',
  });
})();
