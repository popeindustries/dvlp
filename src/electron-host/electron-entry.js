import { dirname, join } from 'node:path';
import {
  filePathToUrlPathname,
  getElectronWorkerData,
  interceptInProcess,
} from 'dvlp/internal';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import workerThreads from 'node:worker_threads';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = join(__dirname, './electron-worker.js');

export async function bootstrapElectron() {
  const electronWorkerData = getElectronWorkerData();
  const { BrowserWindow } = await import('electron');

  interceptInProcess(electronWorkerData);

  // Forward filePath to host server
  BrowserWindow.prototype.loadFile = new Proxy(
    BrowserWindow.prototype.loadFile,
    {
      apply(target, ctx, args) {
        const filePath = /** @type { string } */ (args[0]);
        const url = new URL(
          filePathToUrlPathname(filePath),
          electronWorkerData.hostOrigin,
        );

        return BrowserWindow.prototype.loadURL.call(ctx, url.href);
      },
    },
  );

  // Forward file or app urls to host server
  BrowserWindow.prototype.loadURL = new Proxy(BrowserWindow.prototype.loadURL, {
    apply(target, ctx, args) {
      let url = /** @type { string } */ (args[0]);

      if (
        url.startsWith('file://') ||
        url.startsWith(electronWorkerData.origin)
      ) {
        url = new URL(new URL(url).pathname, electronWorkerData.hostOrigin)
          .href;
      }

      args[0] = url;

      return Reflect.apply(target, ctx, args);
    },
  });

  // Intercept Worker construction in order to instead load electron-worker
  workerThreads.Worker = new Proxy(workerThreads.Worker, {
    construct(target, args, newTarget) {
      const [filePath, options] = args;
      const { port1, port2 } = new workerThreads.MessageChannel();

      port1.on(
        'message',
        /** @param { ElectronProcessMessage} msg */
        (msg) => {
          if (msg.type === 'listening') {
            electronWorkerData.origin = msg.origin;
            electronWorkerData.postMessage(msg);
          }
        },
      );

      electronWorkerData.postMessage({ type: 'watch', filePath });
      options.workerData ??= {};
      options.transferList ??= [];

      args[0] = workerPath;
      options.workerData.dvlp = {
        hostOrigin: electronWorkerData.hostOrigin,
        main: filePath,
        messagePort: port2,
        serializedMocks: electronWorkerData.serializedMocks,
      };
      options.transferList.push(port2);

      return Reflect.construct(target, args, newTarget);
    },
  });

  syncBuiltinESMExports();

  try {
    await import(electronWorkerData.main);
    electronWorkerData.postMessage({ type: 'started' });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
