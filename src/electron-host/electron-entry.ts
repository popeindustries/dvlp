import { dirname, join } from 'node:path';
import {
  error,
  filePathToUrlPathname,
  getElectronWorkerData,
  interceptInProcess,
} from 'dvlp/internal';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ElectronProcessMessage } from './types.ts';
import { escapeRegExp } from '../utils/regexp.ts';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { toBase64Url } from '../utils/base64Url.ts';
import workerThreads from 'node:worker_threads';

const RE_DATA_URL = /^data:text\/html;([^,]+,)?/;
const RE_HTTP_URL = /^https?:\/\//;

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = pathToFileURL(join(__dirname, './electron-worker.js'));
const cwd = pathToFileURL(process.cwd()).href;
const reFileProtocol = new RegExp(
  `(?<=(href|src)=["|'])(${escapeRegExp(cwd)})`,
  'g',
);

export async function bootstrapElectron() {
  const electronWorkerData = getElectronWorkerData();
  const { app, BrowserWindow } = await import('electron');

  interceptInProcess(electronWorkerData);

  try {
    // Intercept app.getAppPath to return the directory of the main script instead of this file
    app.getAppPath = new Proxy(app.getAppPath, {
      apply(target, ctx, args) {
        return path.dirname(electronWorkerData.main);
      },
    });

    // @ts-expect-error - use internal API to access internal WebContents class used by BrowserWindow and BrowserView
    const WebContents = process._linkedBinding(
      'electron_browser_web_contents',
    ).WebContents;

    WebContents.prototype.loadFile = new Proxy(WebContents.prototype.loadFile, {
      apply(target, ctx, args) {
        const filePath = args[0] as string;
        const url = new URL(
          filePathToUrlPathname(filePath),
          electronWorkerData.hostOrigin,
        );

        return WebContents.prototype.loadURL.call(ctx, url.href);
      },
    });

    WebContents.prototype.loadURL = new Proxy(WebContents.prototype.loadURL, {
      apply(target, ctx, args) {
        let url = args[0] as string;

        if (url.startsWith('file://') || RE_HTTP_URL.test(url)) {
          const incomingUrl = new URL(url);

          url = new URL(
            incomingUrl.pathname + incomingUrl.search,
            electronWorkerData.hostOrigin,
          ).href;
        } else if (RE_DATA_URL.test(url)) {
          // data:text/html;base64,XXXXXXXX==
          const [match, encoding] = RE_DATA_URL.exec(url) as RegExpExecArray;
          const encodedMarkup = url.replace(match, '');
          const decodedMarkup =
            encoding === 'base64,'
              ? Buffer.from(encodedMarkup, 'base64').toString('utf8')
              : decodeURIComponent(encodedMarkup);
          const markup = toBase64Url(
            // Remove protocol from any element file:// URLs
            decodedMarkup.replaceAll(reFileProtocol, ''),
          );
          const argOptions = args[1];

          if (argOptions && 'baseURLForDataURL' in argOptions) {
            delete argOptions.baseURLForDataURL;
          }

          url = new URL(`?dvlpdata=${markup}`, electronWorkerData.hostOrigin)
            .href;
        }

        args[0] = url;

        // Internal hidden method to get preload path passed during BrowserWindow/BrowserView construction
        const [preloadPath] = ctx._getPreloadPaths?.() ?? [];

        if (preloadPath) {
          electronWorkerData.postMessage({
            type: 'watch',
            filePath: preloadPath,
            mode: 'read',
          });
        }

        return Reflect.apply(target, ctx, args);
      },
    });
  } catch (err) {
    console.log(err);
  }

  // Intercept Worker construction in order to instead load electron-worker
  workerThreads.Worker = new Proxy(workerThreads.Worker, {
    construct(target, args, newTarget) {
      const [filePathOrURL, options] = args;
      const { port1, port2 } = new workerThreads.MessageChannel();
      const filePath =
        filePathOrURL instanceof URL ? filePathOrURL.href : filePathOrURL;

      port1.unref();
      port1.on('message', (msg: ElectronProcessMessage) => {
        if (msg.type === 'listening') {
          electronWorkerData.postMessage(msg);
        }
      });

      electronWorkerData.postMessage({ type: 'watch', filePath, mode: 'read' });
      options.workerData ??= {};
      options.transferList ??= [];

      args[0] = new URL(
        `data:text/javascript,import '${workerPath}';import '${!filePath.startsWith('file://') ? pathToFileURL(filePath) : filePath}';`,
      );
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

  process.on('message', (msg) => {
    if (msg === 'close') {
      BrowserWindow.getAllWindows().forEach((window) => window.close());
    }
  });
  process.on('uncaughtException', error);
  process.on('unhandledRejection', error);

  try {
    await import(pathToFileURL(electronWorkerData.main).href);
    electronWorkerData.postMessage({ type: 'started' });
  } catch (err) {
    error(err);
  }
}
