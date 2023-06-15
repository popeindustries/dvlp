import {
  filePathToUrlPathname,
  getElectronWorkerData,
  interceptInProcess,
} from 'dvlp/internal';

export async function bootstrapElectron() {
  const workerData = getElectronWorkerData();
  const { BrowserWindow } = await import('electron');

  interceptInProcess(workerData);

  BrowserWindow.prototype.loadFile = new Proxy(
    BrowserWindow.prototype.loadFile,
    {
      apply(target, ctx, args) {
        const filePath = /** @type { string } */ (args[0]);
        // Forward filePath to host server
        const url = new URL(
          filePathToUrlPathname(filePath),
          workerData.hostOrigin,
        );

        return BrowserWindow.prototype.loadURL.call(ctx, url.href);
      },
    },
  );

  BrowserWindow.prototype.loadURL = new Proxy(BrowserWindow.prototype.loadURL, {
    apply(target, ctx, args) {
      let url = /** @type { string } */ (args[0]);

      // Forward file or app urls to host server
      if (url.startsWith('file://') || url.startsWith(workerData.origin)) {
        url = new URL(new URL(url).pathname, workerData.hostOrigin).href;
      }

      args[0] = url;

      return Reflect.apply(target, ctx, args);
    },
  });

  try {
    await import(workerData.main);
    workerData.postMessage({ type: 'started' });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// const originalLoadURL = electron.BrowserWindow.prototype.loadURL;

// /** @type { string } */
// let origin;
// /** @type { Array<DeserializedMock> | undefined } */
// let mocks;

// // TODO: Proxy loadFile/loadURL

// /**
//  * @param { string } filePath
//  * @param { Electron.LoadFileOptions} [options]
//  */
// electron.BrowserWindow.prototype.loadFile = function loadFile(
//   filePath,
//   options,
// ) {
//   return originalLoadURL.call(this, new URL(filePath, origin).href);
// };

// /**
//  * @param { string } url
//  * @param { Electron.LoadURLOptions} [options]
//  */
// electron.BrowserWindow.prototype.loadURL = function loadURL(url, options) {
//   return originalLoadURL.call(this, new URL(url, origin).href);
// };

// // TODO: parse argv for passed data
// // TODO: require(if.cjs) otherwise import()

// process.on(
//   'message',
//   /** @param { ElectronHostMessage } msg */
//   async (msg) => {
//     if (msg.type === 'start') {
//       origin = msg.origin;

//       mocks = msg.mocks?.map((mockData) => {
//         mockData.originRegex = new RegExp(mockData.originRegex);
//         mockData.pathRegex = new RegExp(mockData.pathRegex);
//         mockData.search = new URLSearchParams(mockData.search);
//         return mockData;
//       });

//       try {
//         await import(msg.main);
//         process.send?.({ type: 'started' });
//       } catch (err) {
//         console.error(err);
//         process.exit(1);
//       }
//     }
//   },
// );
