import esbuild from 'esbuild';
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

  for (const filename of ['_dvlp.d.ts', 'dvlp.d.ts', 'dvlp-browser.d.ts']) {
    fs.writeFileSync(path.resolve(filename), fs.readFileSync(path.resolve(`src/${filename}`), 'utf8'));
  }

  await esbuild.build({
    bundle: true,
    entryPoints: ['./src/test-browser/index.js'],
    format: 'esm',
    target: 'es2020',
    outfile: 'dvlp-browser.js',
  });

  await esbuild.build({
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
    external: ['esbuild', 'fsevents', 'undici'],
    format: 'esm',
    target: 'node13.2',
    platform: 'node',
    outfile: 'dvlp.js',
  });
})();
