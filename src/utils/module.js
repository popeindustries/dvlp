import { isJsFilePath, isNodeModuleFilePath } from './is.js';
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import module from 'node:module';

/**
 * Retrieve all dependencies for "filePath"
 *
 * @param { string } filePath
 * @param { 'browser' | 'node' } platform
 */
export async function getDependencies(filePath, platform) {
  if (filePath.startsWith('file://')) {
    filePath = fileURLToPath(filePath);
  }

  /** @type { Set<string> } */
  const dependencies = new Set([filePath]);

  if (isJsFilePath(filePath)) {
    try {
      await esbuild.build({
        bundle: true,
        define: { 'process.env.NODE_ENV': '"development"' },
        entryPoints: [filePath],
        format: 'esm',
        logLevel: 'silent',
        minify: true,
        platform,
        splitting: false,
        target: 'esnext',
        treeShaking: false,
        write: false,
        plugins: [
          {
            name: 'deps',
            setup(build) {
              // @ts-ignore
              build.onLoad({ filter: /.*/ }, (args) => {
                if (!isNodeModuleFilePath(args.path)) {
                  dependencies.add(args.path);
                }
              });
            },
          },
        ],
      });
    } catch (err) {
      // Ignore
    }
  }

  return dependencies;
}

/**
 * Determine whether the current Node.js version supports new Loader API
 */
export function needsLegacyLoader() {
  return !('register' in module);
}
