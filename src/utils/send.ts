import fs from 'node:fs';
import { getType } from './mime.ts';
import type { Res } from '../types.ts';

/**
 * Handle file request
 */
export function send(filePath: string, res: Res) {
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
