import { getProjectPath, isCjsFile } from '../utils/file.js';
import config from '../config.js';
import { error } from '../utils/log.js';
import esbuild from 'esbuild';
import { isProjectFilePath } from '../utils/is.js';
import path from 'path';
import { writeFileSync } from 'fs';

/**
 * Transform server file content for 'filePath'
 *
 * @param { string } filePath
 * @param { string } fileContents
 * @param { Hooks["onServerTransform"] } hookFn
 * @returns { string }
 */
export default function serverTransform(filePath, fileContents, hookFn) {
  let result;

  if (hookFn !== undefined) {
    result = hookFn(filePath, fileContents);
  }
  if (result === undefined && !isCjsFile(filePath, fileContents)) {
    try {
      const sourcemap = isProjectFilePath(filePath);
      const { code, map } = esbuild.transformSync(fileContents, {
        define: {
          'import.meta.url': `"file://${filePath.replace(/\\/g, '/')}"`,
        },
        format: 'cjs',
        // @ts-ignore
        loader: config.esbuildTargetByExtension[path.extname(filePath)] || 'default',
        sourcesContent: false,
        sourcefile: filePath,
        sourcemap,
        sourceRoot: config.sourceMapsDir,
        target: `node${process.versions.node}`,
      });

      if (sourcemap) {
        const sourceMapPath =
          path.resolve(config.sourceMapsDir, getProjectPath(filePath).replace(/\/|\\/g, '_')) + '.map';

        writeFileSync(sourceMapPath, map);
        result = code + `//# sourceMappingURL=${sourceMapPath}`;
      } else {
        result = code;
      }
    } catch (err) {
      error(err);
    }
  }

  return result || fileContents;
}
