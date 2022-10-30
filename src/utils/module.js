import esbuild from 'esbuild';
import { isNodeModuleFilePath } from './is.js';

/**
 * Retrieve all dependencies for "filePath"
 *
 * @param { string } filePath
 * @param { 'browser' | 'node' } platform
 */
export async function getDependencies(filePath, platform) {
  /** @type { Set<string> } */
  const dependencies = new Set([filePath]);

  try {
    await esbuild.build({
      bundle: true,
      define: { 'process.env.NODE_ENV': '"development"' },
      entryPoints: [filePath],
      format: 'esm',
      logLevel: 'silent',
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

  return dependencies;
}
