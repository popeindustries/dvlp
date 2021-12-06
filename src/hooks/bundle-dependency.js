import { existsSync, readFileSync, writeFileSync } from 'fs';
import config from '../config.js';
import Debug from 'debug';
import { decodeBundleFilePath } from '../utils/bundling.js';
import { error } from '../utils/log.js';
import { isBundledFilePath } from '../utils/is.js';
import Metrics from '../utils/metrics.js';
import { parse } from 'cjs-module-lexer';

const debug = Debug('dvlp:bundle');

/**
 * Bundle node_modules cjs dependency and store at 'filePath'
 *
 * @param { string } filePath
 * @param { Res } res
 * @param { Pick<esbuild, "build"> } esbuild
 * @param { Hooks["onDependencyBundle"] } hookFn
 * @returns { Promise<void> }
 */
export default async function bundleDependency(filePath, res, esbuild, hookFn) {
  if (existsSync(filePath)) {
    return;
  }

  if (isBundledFilePath(filePath)) {
    res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);

    const [moduleId, modulePath] = decodeBundleFilePath(filePath);
    let code;

    if (!modulePath) {
      error(`unable to resolve path for module: ${moduleId}`);
      return;
    }

    try {
      const moduleContents = readFileSync(modulePath, 'utf8');
      let entryFilePath = modulePath;
      let entryFileContents = moduleContents;

      if (hookFn) {
        code = await hookFn(moduleId, entryFilePath, entryFileContents, {
          esbuild,
        });
      }

      if (code === undefined) {
        /** @type { Array<string> } */
        let exports = [];

        try {
          ({ exports } = parse(moduleContents));
        } catch (err) {
          // ignore
        }

        const brokenNamedExports = config.brokenNamedExportsPackages[moduleId] || [];

        // Fix named exports for cjs
        if (exports.length > 0 || brokenNamedExports.length > 0) {
          const inlineableModulePath = modulePath.replace(/\\/g, '\\\\');
          const namedExports = new Set(['default', ...exports, ...brokenNamedExports]);
          namedExports.delete('__esModule');
          const fileContents = `export {${Array.from(namedExports).join(', ')}} from '${inlineableModulePath}';`;

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
      debug(`error bundling "${moduleId}"`);
      res.writeHead(500);
      res.end(/** @type { Error } */ (err).message);
      error(err);
      return;
    }

    if (code !== undefined) {
      debug(`bundled content for ${moduleId}`);
      writeFileSync(filePath, code);
      res.bundled = true;
    }

    res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);
  }
}
