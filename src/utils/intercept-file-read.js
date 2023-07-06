import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import util from 'node:util';

/** @type { Set<InterceptFileReadCallback> } */
const fileReadListeners = new Set();
const originalReadStreamRead = fs.ReadStream.prototype._read;
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;

// Early init to ensure that 3rd-party libraries use proxied versions
initInterceptFileRead();

/**
 * Listen for file system reads and report
 *
 * @param { InterceptFileReadCallback } fn
 * @returns { () => void }
 */
export function interceptFileRead(fn) {
  initInterceptFileRead();
  fileReadListeners.add(fn);
  return restoreFileRead.bind(null, fn);
}

/**
 * Initialise `fileRead` proxy
 */
function initInterceptFileRead() {
  if (!util.types.isProxy(fs.readFile)) {
    // Proxy ReadStream private method to work around patching by graceful-fs
    const ReadStream = fs.ReadStream.prototype;

    ReadStream._read = new Proxy(ReadStream._read, {
      apply(target, ctx, args) {
        notifyListeners(fileReadListeners, String(ctx.path));
        return Reflect.apply(target, ctx, args);
      },
    });

    for (const method of ['readFile', 'readFileSync']) {
      // @ts-ignore
      fs[method] = new Proxy(fs[method], {
        apply(target, ctx, args) {
          notifyListeners(fileReadListeners, String(args[0]));
          return Reflect.apply(target, ctx, args);
        },
      });
    }

    syncBuiltinESMExports();
  }
}

/**
 * Restore unproxied file reading behaviour
 *
 * @param { InterceptFileReadCallback } fn
 */
function restoreFileRead(fn) {
  fileReadListeners.delete(fn);
  if (!fileReadListeners.size) {
    fs.ReadStream.prototype._read = originalReadStreamRead;
    fs.readFile = originalReadFile;
    fs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
  }
}

/**
 * Notify 'listeners' with 'args'
 *
 * @param { Set<InterceptFileReadCallback> } listeners
 * @param { string } filePath
 */
function notifyListeners(listeners, filePath) {
  for (const listener of listeners) {
    listener(filePath);
  }
}
