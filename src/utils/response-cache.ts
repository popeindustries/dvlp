import type { ContentType, Req, Res } from '../types.ts';
import { getProjectPath, getTypeFromPath } from './file.ts';
import { createHash } from 'node:crypto';
import Debug from 'debug';
import fs from 'node:fs';
import { getType } from './mime.ts';
import { isInModuleGraph } from './module-graph.ts';

interface ResponseCacheEntry {
  body: string;
  cacheControl: string;
  contentLength: number;
  contentType: string;
  etag: string;
  filePath: string;
  mtimeMs: number;
  type: ContentType | undefined;
}

const debug = Debug('dvlp:responsecache');
const cache = new Map<string, ResponseCacheEntry>();

/**
 * Serve fully patched response for "filePath" from cache, if fresh.
 * Sends "304 Not Modified" when the client already has the cached version.
 * Returns "true" if served.
 */
export function serveCachedResponse(
  req: Req,
  res: Res,
  filePath: string,
): boolean {
  const key = getCacheKey(req, filePath);
  const entry = cache.get(key);

  if (entry === undefined) {
    return false;
  }

  let mtimeMs = -1;

  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    // Removed file handled below
  }

  if (mtimeMs !== entry.mtimeMs) {
    debug(`cache stale for "${getProjectPath(filePath)}"`);
    cache.delete(key);
    return false;
  }

  res.cached = true;

  if (req.headers['if-none-match'] === entry.etag) {
    debug(`revalidated "${getProjectPath(filePath)}"`);
    res.writeHead(304, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': entry.cacheControl,
      ETag: entry.etag,
    });
    res.end();
    return true;
  }

  debug(`serving cached response for "${getProjectPath(filePath)}"`);
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': entry.cacheControl,
    'Content-Length': entry.contentLength,
    'Content-Type': entry.contentType,
    ETag: entry.etag,
  });
  res.end(entry.body);
  return true;
}

/**
 * Store fully patched response "body" for "filePath".
 * Returns the generated etag, or "undefined" if not cacheable.
 */
export function setCachedResponse(
  req: Req,
  res: Res,
  filePath: string,
  body: string,
): string | undefined {
  let mtimeMs;

  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    return;
  }

  const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`;
  const cacheControl = (res.getHeader('Cache-Control') as string) ?? 'no-cache';

  cache.set(getCacheKey(req, filePath), {
    body,
    cacheControl,
    contentLength: Buffer.byteLength(body),
    contentType: getType(filePath),
    etag,
    filePath,
    mtimeMs,
    type: getTypeFromPath(filePath),
  });

  return etag;
}

/**
 * Invalidate cached responses affected by change to "filePath".
 * Mirrors transform cache semantics: a changed file with no cached response of
 * its own may be a dependency concatenated into any response of the same type.
 * Module graph imports are exempt: they are fetched separately by the browser,
 * so their content is never embedded in an importer's response.
 */
export function invalidateCachedResponses(filePath: string): void {
  let hadEntry = false;

  for (const [key, entry] of cache) {
    if (entry.filePath === filePath) {
      cache.delete(key);
      hadEntry = true;
    }
  }

  if (!hadEntry && !isInModuleGraph(filePath)) {
    const changedType = getTypeFromPath(filePath);

    for (const [key, entry] of cache) {
      if (entry.type === changedType) {
        cache.delete(key);
      }
    }
  }
}

/**
 * Clear all cached responses
 */
export function clearCachedResponses(): void {
  cache.clear();
}

/**
 * Retrieve cache key for "req" and "filePath".
 * Segmented by user agent to match transform cache behaviour.
 */
function getCacheKey(req: Req, filePath: string): string {
  return `${req.headers['user-agent'] ?? ''}:${filePath}`;
}
