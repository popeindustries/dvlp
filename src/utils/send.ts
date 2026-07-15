import { isBundledFilePath, isNodeModuleFilePath } from './is.ts';
import type { Req, Res } from '../types.ts';
import config from '../config.ts';
import fs from 'node:fs';
import { getType } from './mime.ts';

/**
 * Handle file request
 */
export function send(filePath: string, res: Res, req?: Req) {
  if (res.headersSent) {
    return;
  }

  if (res.getHeader('Content-Type') === undefined) {
    const type = getType(filePath);
    res.setHeader('Content-Type', type);
  }

  try {
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      const etag = `W/"${stat.size.toString(16)}-${Math.round(
        stat.mtimeMs,
      ).toString(16)}"`;

      if (res.getHeader('Cache-Control') === undefined) {
        const cacheControl =
          isBundledFilePath(filePath) || isNodeModuleFilePath(filePath)
            ? `public, max-age=${config.maxAgeLong}`
            : 'no-cache';
        res.setHeader('Cache-Control', cacheControl);
      }
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', stat.mtime.toUTCString());

      if (req !== undefined && isFresh(req, etag, stat.mtimeMs)) {
        res.writeHead(304);
        res.end();
        return;
      }

      res.setHeader('Content-Length', stat.size);

      const stream = fs.createReadStream(filePath);

      stream.on('error', (error: Error) => {
        // @ts-expect-error - it exists
        if (error.code === 'ENOENT') {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });

      stream.pipe(res);
    }
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

/**
 * Determine if client's cached version of the file is still fresh
 */
function isFresh(req: Req, etag: string, mtimeMs: number): boolean {
  const ifNoneMatch = req.headers['if-none-match'];

  if (ifNoneMatch !== undefined) {
    return ifNoneMatch === etag;
  }

  const ifModifiedSince = req.headers['if-modified-since'];

  if (ifModifiedSince !== undefined) {
    const since = Date.parse(ifModifiedSince);
    // Header has second precision
    return !Number.isNaN(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
  }

  return false;
}
