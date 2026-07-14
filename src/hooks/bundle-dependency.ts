import type { esbuild as esbuildType, Res } from '../types.ts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import config from '../config.ts';
import Debug from 'debug';
import { error } from '../utils/log.ts';
import { getBundleSourcePath } from '../utils/bundling.ts';
import type { Hooks } from './types.ts';
import { isBundledFilePath } from '../utils/is.ts';
import { Metrics } from '../utils/metrics.ts';
import { parse } from 'cjs-module-lexer';

const debug = Debug('dvlp:bundle');

/**
 * Bundle node_modules cjs dependency and store at 'filePath'
 */
export async function bundleDependency(
  filePath: string,
  res: Res,
  esbuild: Pick<esbuildType, 'build'>,
  hookFn: Hooks['onDependencyBundle'],
): Promise<void> {
  if (existsSync(filePath)) {
    return;
  }

  if (isBundledFilePath(filePath)) {
    res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);

    const [specifier, sourcePath] = getBundleSourcePath(filePath);
    let code;

    if (!sourcePath) {
      error(`unable to resolve path for module: ${specifier}`);
      return;
    }

    try {
      const sourceContents = readFileSync(sourcePath, 'utf8');
      let entryFilePath = sourcePath;
      let entryFileContents = sourceContents;

      if (hookFn) {
        code = await hookFn(specifier, entryFilePath, entryFileContents, {
          esbuild,
        });
      }

      if (code === undefined) {
        let exports: Array<string> = [];

        try {
          ({ exports } = parse(sourceContents));
        } catch {
          // ignore
        }

        const brokenNamedExports =
          config.brokenNamedExportsPackages[specifier] || [];

        // Fix named exports for cjs
        if (exports.length > 0 || brokenNamedExports.length > 0) {
          const inlineableModulePath = sourcePath.replace(/\\/g, '\\\\');
          const namedExports = new Set([
            'default',
            ...exports,
            ...brokenNamedExports,
          ]);
          namedExports.delete('__esModule');
          const fileContents = `export {${Array.from(namedExports).join(
            ', ',
          )}} from '${inlineableModulePath}';`;

          entryFilePath = filePath;
          entryFileContents = fileContents;
          writeFileSync(filePath, fileContents);
        }

        const result = await esbuild.build({
          bundle: true,
          define: { 'process.env.NODE_ENV': '"development"' },
          entryPoints: [entryFilePath],
          format: 'esm',
          logLevel: 'error',
          mainFields: ['module', 'browser', 'main'],
          platform: 'browser',
          target: 'es2018',
          write: false,
        });

        if (!result.outputFiles) {
          throw Error(`unknown bundling error: ${result.warnings.join('\n')}`);
        }
        code = result.outputFiles[0].text;
      }
    } catch (err) {
      debug(`error bundling "${specifier}"`);
      res.writeHead(500);
      res.end((err as Error).message);
      error(err);
      return;
    }

    if (code !== undefined) {
      debug(`bundled content for ${specifier}`);
      writeFileSync(filePath, code);
      res.bundled = true;
    }

    res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);
  }
}
