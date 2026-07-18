import type { esbuild as esbuildType, Res } from '../types.ts';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import config from '../config.ts';
import Debug from 'debug';
import { error } from '../utils/log.ts';
import { getBundleSourcePath } from '../utils/bundling.ts';
import type { Hooks } from './types.ts';
import { isBundledFilePath } from '../utils/is.ts';
import { Metrics } from '../utils/metrics.ts';
import { parse } from 'cjs-module-lexer';

const debug = Debug('dvlp:bundle');
const inflightBundles = new Map<string, Promise<boolean>>();

/**
 * Bundle node_modules cjs dependency and store at 'filePath'
 */
export async function bundleDependency(
  filePath: string,
  res: Res,
  esbuild: Pick<esbuildType, 'build'>,
  hookFn: Hooks['onDependencyBundle'],
): Promise<void> {
  if (!isBundledFilePath(filePath)) {
    return;
  }

  // Concurrent requests for a not-yet-written bundle share a single build,
  // otherwise the intermediate named-exports entry file (written to the same
  // path) could be served as the finished bundle
  let pending = inflightBundles.get(filePath);

  if (pending === undefined) {
    if (existsSync(filePath)) {
      return;
    }

    pending = createBundle(filePath, esbuild, hookFn).finally(() => {
      inflightBundles.delete(filePath);
    });
    inflightBundles.set(filePath, pending);
  }

  res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);

  try {
    if (await pending) {
      res.bundled = true;
    }
  } catch (err) {
    res.writeHead(500);
    res.end((err as Error).message);
    error(err);
  }

  res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);
}

/**
 * Build the bundle for 'filePath', writing the result to disk.
 * Returns "false" if the source module could not be resolved.
 */
async function createBundle(
  filePath: string,
  esbuild: Pick<esbuildType, 'build'>,
  hookFn: Hooks['onDependencyBundle'],
): Promise<boolean> {
  const [specifier, sourcePath] = getBundleSourcePath(filePath);

  if (!sourcePath) {
    error(`unable to resolve path for module: ${specifier}`);
    return false;
  }

  let code;

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
    // Remove the intermediate named-exports entry file, otherwise the
    // existsSync check would serve it as the finished bundle
    try {
      unlinkSync(filePath);
    } catch {
      // Nothing written
    }
    throw err;
  }

  debug(`bundled content for ${specifier}`);
  writeFileSync(filePath, code);
  return true;
}
