import { isJsFilePath, isNodeModuleFilePath } from './is.ts';
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

/**
 * Retrieve all dependencies for "filePath"
 */
export async function getDependencies(
  filePath: string,
  platform: 'browser' | 'node',
) {
  if (filePath.startsWith('file://')) {
    filePath = fileURLToPath(filePath);
  }

  const dependencies = new Set<string>([filePath]);

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
              build.onLoad({ filter: /.*/ }, (args) => {
                if (!isNodeModuleFilePath(args.path)) {
                  dependencies.add(args.path);
                }
              });
            },
          },
        ],
      });
    } catch {
      // Ignore
    }
  }

  return dependencies;
}
