import electron from 'electron';
import { interceptClientRequest } from '../utils/intercept-client-request.js';
import { isEqualSearchParams } from '../utils/url.js';

const originalLoadURL = electron.BrowserWindow.prototype.loadURL;

/** @type { string } */
let origin;
/** @type { Array<DeserializedMock> | undefined } */
let mocks;

// TODO: Proxy loadFile/loadURL

/**
 * @param { string } filePath
 * @param { Electron.LoadFileOptions} [options]
 */
electron.BrowserWindow.prototype.loadFile = function loadFile(
  filePath,
  options,
) {
  return originalLoadURL.call(this, new URL(filePath, origin).href);
};

/**
 * @param { string } url
 * @param { Electron.LoadURLOptions} [options]
 */
electron.BrowserWindow.prototype.loadURL = function loadURL(url, options) {
  return originalLoadURL.call(this, new URL(url, origin).href);
};

// TODO: parse argv for passed data
// TODO: require(if.cjs) otherwise import()

process.on(
  'message',
  /** @param { ElectronHostMessage } msg */
  async (msg) => {
    if (msg.type === 'start') {
      origin = msg.origin;

      mocks = msg.mocks?.map((mockData) => {
        mockData.originRegex = new RegExp(mockData.originRegex);
        mockData.pathRegex = new RegExp(mockData.pathRegex);
        mockData.search = new URLSearchParams(mockData.search);
        return mockData;
      });

      try {
        await import(msg.main);
        process.send?.({ type: 'started' });
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    }
  },
);

// Redirect mocked request to host
interceptClientRequest((url) => {
  if (mocks) {
    for (const mock of mocks) {
      if (
        !mock.originRegex.test(url.origin) ||
        (!mock.ignoreSearch &&
          mock.search &&
          !isEqualSearchParams(url.searchParams, mock.search))
      ) {
        continue;
      }

      if (mock.pathRegex.exec(url.pathname) != null) {
        const href = url.href;
        url.host = new URL(origin).host;
        url.search = `?dvlpmock=${encodeURIComponent(href)}`;
        break;
      }
    }
  }

  return true;
});
