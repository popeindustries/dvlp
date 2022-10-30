import config from '../config.js';
import crypto from 'node:crypto';
import electron from 'electron';
import fs from 'node:fs';
import { interceptClientRequest } from '../utils/intercept-client-request.js';
import { isEqualSearchParams } from '../utils/url.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RE_DATA_URL = /^data:text\/html;([^,]+,)?/;

const originalLoadURL = electron.BrowserWindow.prototype.loadURL;

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
  return originalLoadURL(new URL(filePath, origin).href);
};

/**
 * @param { string } url
 * @param { Electron.LoadURLOptions} [options]
 */
electron.BrowserWindow.prototype.loadURL = function loadURL(url, options) {
  if (RE_DATA_URL.test(url)) {
    const [match, encoding] = /** @type { RegExpExecArray } */ (
      RE_DATA_URL.exec(url)
    );
    const encodedMarkup = url.replace(match, '');
    const markup =
      encoding === 'base64'
        ? Buffer.from(encodedMarkup, 'base64').toString('utf-8')
        : decodeURI(encodedMarkup);
    const hash = crypto.createHash('md5').update(markup).digest('hex');
    const filePath = path.join(config.electronDirPath, `${hash}.html`);

    fs.writeFileSync(filePath, markup, 'utf-8');
    url = pathToFileURL(filePath).href;
  }
  console.log(url);

  return originalLoadURL(new URL(url, origin).href);
};

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
