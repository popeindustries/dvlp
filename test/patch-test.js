'use strict';

const { CACHE_DIR_NAME } = require('../lib/utils/module');
const { cleanCache, destroyWorkers } = require('../lib/utils/module');
const { expect } = require('chai');
const { ServerResponse } = require('http');
const { patchResponse } = require('../lib/utils/patch');

function getBody(res) {
  const output = res.output.filter((chunk) => typeof chunk === 'string').join('');
  return output.replace(res._header, '');
}
function getRequest(url, headers = { accept: '*/*' }) {
  return {
    headers,
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    method: 'GET',
    url
  };
}

describe('patch', () => {
  afterEach(() => {
    cleanCache();
  });
  after(async () => {
    await destroyWorkers();
  });

  describe('patchResponse()', () => {
    it('should inject script into buffered html response', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, 'test inject');
      res.end('</body>');
      expect(getBody(res)).to.include('test inject');
    });
    it('should inject script into streamed html response', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, 'test inject');
      res.write('</body>');
      expect(getBody(res)).to.include('test inject');
    });
    it('should resolve bare js import id', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res, true);
      res.end('import lodash from "lodash";');
      expect(getBody(res)).to.equal(`import lodash from "/${CACHE_DIR_NAME}/lodash-4.17.10.js";`);
    });
    it('should resolve multiple bare js import ids', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res, true);
      res.end(
        'import lodashArr from "lodash/array";\nimport { foo } from "./foo.js";\nimport debug from "debug";'
      );
      expect(getBody(res)).to.equal(
        `import lodashArr from "/${CACHE_DIR_NAME}/lodash__array-4.17.10.js";\nimport { foo } from "./foo.js";\nimport debug from "/${CACHE_DIR_NAME}/debug-3.1.0.js";`
      );
    });
  });
});
