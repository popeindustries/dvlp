import { basename, extname } from 'node:path';
import type { esbuild as esbuildType, Res } from '../types.ts';
import { findClosest, getProjectPath, getTypeFromPath } from '../utils/file.ts';
import type { Hooks, TransformHookContext } from './types.ts';
import { isJsxFilePath, isTransformableJsFile } from '../utils/is.ts';
import Debug from 'debug';
import { error } from '../utils/log.ts';
import { getType } from '../utils/mime.ts';
import { Metrics } from '../utils/metrics.ts';
import { parseEsbuildTarget } from '../utils/platform.ts';
import { readFileSync } from 'node:fs';
import type { TransformOptions } from 'esbuild';
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
 */
export async function transform(
  filePath: string,
  lastChangedFilePath: string,
  res: Res,
  clientPlatform: TransformHookContext['client'],
  cache: Map<string, string>,
  esbuild: esbuildType,
  hookFn: Hooks['onTransform'],
): Promise<void> {
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

        // Amaro strips types via whitespace substitution, but can't transform
        // JSX or downlevel syntax, so fall back to esbuild for .tsx/.jsx
        if (isJsxFilePath(filePath)) {
          const options: TransformOptions = {
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
        } else {
          code = transformSync(fileContents, {
            mode: 'strip-only',
            module: true,
            filename: basename(filePath),
          }).code;
        }
      }
      if (code !== undefined) {
        transformed = true;
        cache.set(cacheKey, code);
      }
    } catch (err) {
      debug(`error transforming "${relativeFilePath}"`);
      res.writeHead(500);
      res.end((err as Error).message);
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
