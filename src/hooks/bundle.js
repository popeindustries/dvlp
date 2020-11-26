'use strict';

const { existsSync, readFileSync, writeFileSync } = require('fs');
const { basename } = require('path');
const debug = require('debug')('dvlp:bundle');
const { decodeBundleId } = require('../utils/bundling.js');
const { error } = require('../utils/log.js');
const { isBundledFilePath } = require('../utils/is.js');
const Metrics = require('../utils/metrics.js');
const { resolve } = require('../resolver/index.js');

/**
 * Bundle node_modules cjs dependency and store at 'filePath'
 *
 * @param { string } filePath
 * @param { Res } res
 * @param { import("esbuild").Service } buildService
 * @param { Hooks["onDependencyBundle"] } hookFn
 * @returns { Promise<void> }
 */
module.exports = async function bundle(filePath, res, buildService, hookFn) {
  if (existsSync(filePath)) {
    return;
  }

  if (isBundledFilePath(filePath)) {
    res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);

    const fileName = basename(filePath);
    const moduleId = decodeBundleId(
      fileName.slice(0, fileName.lastIndexOf('-')),
    );
    const modulePath = resolve(moduleId);
    let code;

    if (!modulePath) {
      error(`unable to resolve path for module: ${moduleId}`);
      return;
    }

    try {
      if (hookFn) {
        code = await hookFn(modulePath, readFileSync(modulePath, 'utf8'), {
          esbuildService: buildService,
        });
      }
      if (code === undefined) {
        const result = await buildService.build({
          bundle: true,
          define: { 'process.env.NODE_ENV': 'development' },
          entryPoints: [modulePath],
          format: 'esm',
          logLevel: 'error',
          plugins: [
            {
              name: 'external',
              setup(build) {
                build.onResolve(
                  { filter: /^[^./]/, namespace: 'external' },
                  (args) => {
                    return { external: true };
                  },
                );
              },
            },
          ],
          target: 'es2020',
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
      writeFileSync(filePath, code);
      res.bundled = true;
    }

    res.metrics.recordEvent(Metrics.EVENT_NAMES.bundle);
  }
};
