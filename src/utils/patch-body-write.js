import { brotliDecompressSync, unzipSync } from 'zlib';

/**
 * Proxy body write for 'res', performing 'action' on write()/end()
 *
 * @param { Res } res
 * @param { (data: string) => string } action
 */
export function proxyBodyWrite(res, action) {
  const originalSetHeader = res.setHeader;
  /** @type { Buffer } */
  let buffer;

  // Proxy write() to buffer streaming response
  res.write = new Proxy(res.write, {
    apply(target, ctx, args) {
      let [chunk] = args;

      if (typeof chunk === 'string') {
        chunk = Buffer.from(chunk);
      }
      buffer = Buffer.concat([buffer || Buffer.from(''), chunk]);
      return;
    },
  });

  // Proxy end() to intercept response body
  res.end = new Proxy(res.end, {
    apply(target, ctx, args) {
      let [data = buffer, ...extraArgs] = args;
      let size = 0;

      if (data) {
        if (Buffer.isBuffer(data)) {
          if (res.encoding === 'gzip') {
            data = unzipSync(data);
          } else if (res.encoding === 'br') {
            data = brotliDecompressSync(data);
          }
          data = data.toString();
        }
        data = action(data);
        size = Buffer.byteLength(data);
      }

      if (!res.headersSent) {
        if (size) {
          // @ts-ignore
          originalSetHeader.call(res, 'Content-Length', size);
        }
      }

      return Reflect.apply(target, ctx, [data, ...extraArgs]);
    },
  });

  // Prevent setting of Content-Length
  res.setHeader = new Proxy(res.setHeader, {
    apply(target, ctx, args) {
      let [key, value] = args;

      if (key.toLowerCase() === 'content-length') {
        return;
      }

      return Reflect.apply(target, ctx, [key, value]);
    },
  });

  // Prevent setting of Content-Length
  res.writeHead = new Proxy(res.writeHead, {
    apply(target, ctx, args) {
      // First argument is always statusCode
      if (args.length > 1) {
        for (const key in args[args.length - 1]) {
          if (key.toLowerCase() === 'content-length') {
            delete args[args.length - 1][key];
          }
        }
      }

      return Reflect.apply(target, ctx, args);
    },
  });
}
