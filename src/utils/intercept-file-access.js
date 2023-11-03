import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import util from 'node:util';

/** @type { Set<InterceptFileAccessCallback> } */
const fileAccessListeners = new Set();
const originalReadStreamRead = fs.ReadStream.prototype._read;
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;
const originalWriteFile = fs.writeFile;
const originalWriteFileSync = fs.writeFileSync;

// Early init to ensure that 3rd-party libraries use proxied versions
initInterceptFileAccess();

/**
 * Listen for file system reads and report
 *
 * @param { InterceptFileAccessCallback } fn
 * @returns { () => void }
 */
export function interceptFileAccess(fn) {
  initInterceptFileAccess();
  fileAccessListeners.add(fn);
  return restoreFileAccess.bind(null, fn);
}

/**
 * Initialise `fileRead` proxy
 */
function initInterceptFileAccess() {
  if (!util.types.isProxy(fs.readFile)) {
    // Proxy ReadStream private method to work around patching by graceful-fs
    const ReadStream = fs.ReadStream.prototype;

    ReadStream._read = new Proxy(ReadStream._read, {
      apply(target, ctx, args) {
        notifyListeners(fileAccessListeners, String(ctx.path), 'read');
        return Reflect.apply(target, ctx, args);
      },
    });

    for (const method of ['readFile', 'readFileSync']) {
      // @ts-ignore
      fs[method] = new Proxy(fs[method], {
        apply(target, ctx, args) {
          notifyListeners(fileAccessListeners, String(args[0]), 'read');
          return Reflect.apply(target, ctx, args);
        },
      });
    }
    for (const method of ['writeFile', 'writeFileSync']) {
      // @ts-ignore
      fs[method] = new Proxy(fs[method], {
        apply(target, ctx, args) {
          notifyListeners(fileAccessListeners, String(args[0]), 'write');
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
 * @param { InterceptFileAccessCallback } fn
 */
function restoreFileAccess(fn) {
  fileAccessListeners.delete(fn);
  if (!fileAccessListeners.size) {
    fs.ReadStream.prototype._read = originalReadStreamRead;
    fs.readFile = originalReadFile;
    fs.readFileSync = originalReadFileSync;
    fs.writeFile = originalWriteFile;
    fs.writeFileSync = originalWriteFileSync;
    syncBuiltinESMExports();
  }
}

/**
 * Notify 'listeners' with 'args'
 *
 * @param { Set<InterceptFileAccessCallback> } listeners
 * @param { string } filePath
 * @param { 'read' | 'write' } mode
 */
function notifyListeners(listeners, filePath, mode) {
  for (const listener of listeners) {
    listener(filePath, mode);
  }
}
