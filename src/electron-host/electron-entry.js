import electron from 'electron';
import { interceptClientRequest } from '../utils/intercept-client-request.js';
import { isEqualSearchParams } from '../utils/url.js';

/** @type { string } */
let origin;
/** @type { Array<DeserializedMock> | undefined } */
let mocks;

/**
 * @param { string } filePath
 * @param { Electron.LoadFileOptions} [options]
 */
electron.BrowserWindow.prototype.loadFile = function loadFile(
  filePath,
  options,
) {
  const url = new URL(filePath, origin);
  return this.loadURL(url.href);
};

console.log('some log');
console.error('some error');

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
      } catch (err) {
        console.error(err);
        throw err;
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
