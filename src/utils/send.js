import fs from 'node:fs';
import { getType } from './mime.js';

/**
 * Handle file request
 *
 * @param { string } filePath
 * @param { Res } res
 */
export function send(filePath, res) {
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

      stream.on(
        'error',
        /** @param { Error } error */
        (error) => {
          // @ts-expect-error - it exists
          if (error.code === 'ENOENT') {
            res.writeHead(404);
            res.end('Not Found');
          } else {
            res.writeHead(500);
            res.end('Internal Server Error');
          }
        },
      );

      stream.pipe(res);
    }
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}
