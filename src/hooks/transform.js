import { findClosest, getProjectPath, getTypeFromPath } from '../utils/file.js';
import Debug from 'debug';
import { error } from '../utils/log.js';
import { basename, extname } from 'node:path';
import { getType } from '../utils/mime.js';
import { isTransformableJsFile } from '../utils/is.js';
import { Metrics } from '../utils/metrics.js';
import { parseEsbuildTarget } from '../utils/platform.js';
import { readFileSync } from 'node:fs';
import { transformSync } from 'amaro';

const debug = Debug('dvlp:transform');
const tsconfigPath = findClosest('tsconfig.json');
const tsconfig = tsconfigPath
  ? readFileSync(tsconfigPath, 'utf8')
  : `{
      compilerOptions: {
        useDefineForClassFields: true,
        verbatimModuleSyntax: true,
        erasableSyntaxOnly: true
      },
    }`;

/**
 * Transform file content for request for 'filePath'
 *
 * @param { string } filePath
 * @param { string } lastChangedFilePath
 * @param { Res } res
 * @param { TransformHookContext["client"] } clientPlatform
 * @param { Map<string, string> } cache
 * @param { esbuild } esbuild
 * @param { 'esbuild' | 'amaro' } defaultTransformer
 * @param { Hooks["onTransform"] } hookFn
 * @returns { Promise<void> }
 */
export async function transform(
  filePath,
  lastChangedFilePath,
  res,
  clientPlatform,
  cache,
  esbuild,
  defaultTransformer,
  hookFn,
) {
  res.metrics.recordEvent(Metrics.EVENT_NAMES.transform);

  // Segment cache by user agent to support different transforms based on client
  const cacheKey = `${clientPlatform.ua}:${filePath}`;
  const lastChangedCacheKey = `${clientPlatform.ua}:${lastChangedFilePath}`;
  const relativeFilePath = getProjectPath(filePath);
  const fileType = getTypeFromPath(filePath);
  const fileExtension = extname(filePath);
  // Dependencies that are concatenated during transform aren't cached,
  // but they are watched when read from file system during transformation,
  // so transform again if changed file is of same type
  const lastChangedIsDependency =
    lastChangedFilePath &&
    !cache.has(lastChangedCacheKey) &&
    getTypeFromPath(lastChangedFilePath) === fileType;
  let code = cache.get(cacheKey);
  let transformed = false;

  if (lastChangedIsDependency || lastChangedFilePath === filePath || !code) {
    try {
      const fileContents = readFileSync(filePath, 'utf8');
      code = undefined;

      if (hookFn !== undefined) {
        code = await hookFn(filePath, fileContents, {
          client: clientPlatform,
          esbuild,
        });
      }
      if (code === undefined) {
        // Skip default transform if not necessary
        if (!isTransformableJsFile(filePath, fileContents)) {
          return;
        }

        if (defaultTransformer === 'esbuild') {
          /** @type { import("esbuild").TransformOptions } */
          const options = {
            format: 'esm',
            // @ts-expect-error - filtered by "fileType"
            loader: fileExtension.slice(1),
            logLevel: 'warning',
            sourcefile: filePath,
            target: parseEsbuildTarget(clientPlatform),
          };

          if (tsconfig) {
            options.tsconfigRaw = tsconfig;
          }

          code = (await esbuild.transform(fileContents, options)).code;
        } else if (defaultTransformer === 'amaro') {
          code = transformSync(fileContents, {
            mode: 'strip-only',
            module: true,
            filename: basename(filePath),
          }).code;
        } else {
          throw Error(
            `unknown transformer configured ('esbuild' or 'amaro' supported): ${defaultTransformer}`,
          );
        }
      }
      if (code !== undefined) {
        transformed = true;
        cache.set(cacheKey, code);
      }
    } catch (err) {
      debug(`error transforming "${relativeFilePath}"`);
      res.writeHead(500);
      res.end(/** @type { Error } */ (err).message);
      error(err);
      return;
    }
  }

  if (code !== undefined) {
    debug(
      `${
        transformed ? 'transformed content for' : 'skipping transform for'
      } "${relativeFilePath}"`,
    );
    res.transformed = true;
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Length': Buffer.byteLength(code),
      'Content-Type': getType(filePath) || undefined,
    });
    res.end(code);
    res.metrics.recordEvent(Metrics.EVENT_NAMES.transform);
  }
}
