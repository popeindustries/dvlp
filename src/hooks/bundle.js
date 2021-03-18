'use strict';

const { existsSync, readFileSync, writeFileSync } = require('fs');
const { decodeBundleId, encodeOriginalBundledSourcePath } = require('../utils/bundling.js');
const { basename } = require('path');
const config = require('../config.js');
const debug = require('debug')('dvlp:bundle');
const { error } = require('../utils/log.js');
const { isBundledFilePath } = require('../utils/is.js');
const { isEsmFile } = require('../utils/file.js');
const Metrics = require('../utils/metrics.js');
const { parse } = require('cjs-module-lexer');
const { resolve } = require('../resolver/index.js');

/**
 * Bundle node_modules cjs dependency and store at 'filePath'
 *
 * @param { string } filePath
 * @param { Res } res
 * @param { esbuild } esbuild
 * @param { Hooks["onDependencyBundle"] } hookFn
 * @returns { Promise<void> }
 */
module.exports = async function bundle(filePath, res, esbuild, hookFn) {
  if (existsSync(filePath)) {
    return;
  }

  if (isBundledFilePath(filePath)) {
    res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);

    const fileName = basename(filePath);
    const moduleId = decodeBundleId(fileName.slice(0, fileName.lastIndexOf('-')));
    const modulePath = resolve(moduleId);
    let code;

    if (!modulePath) {
      error(`unable to resolve path for module: ${moduleId}`);
      return;
    }

    try {
      const moduleContents = readFileSync(modulePath, 'utf8');
      const isEsm = isEsmFile(modulePath, moduleContents);
      let entryFilePath = modulePath;
      let entryFileContents = moduleContents;

      // Fix named exports for cjs
      if (!isEsm) {
        const brokenNamedExports = config.brokenNamedExportsPackages[moduleId] || [];
        const inlineableModulePath = modulePath.replace(/\\/g, '\\\\');
        const { exports } = parse(moduleContents);
        const namedExports = exports.filter((e) => e !== 'default').concat(brokenNamedExports);
        const fileContents = namedExports.length
          ? `export { default } from "${inlineableModulePath}"; export {${namedExports.join(
              ', ',
            )}} from '${inlineableModulePath}';`
          : `export { default } from "${inlineableModulePath}"`;

        entryFilePath = filePath;
        entryFileContents = fileContents;
        writeFileSync(filePath, fileContents);
      }

      if (hookFn) {
        code = await hookFn(moduleId, entryFilePath, entryFileContents, {
          esbuild,
        });
      }
      if (code === undefined) {
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
      res.end(err.message);
      error(err);
      return;
    }

    if (code !== undefined) {
      debug(`bundled content for ${moduleId}`);
      writeFileSync(filePath, `${encodeOriginalBundledSourcePath(modulePath)}\n${code}`);
      res.bundled = true;
    }

    res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);
  }
};
