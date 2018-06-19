'use strict';

const { cleanCache, destroyWorkers } = require('../lib/utils/moduleBundler');
const { expect } = require('chai');
const { moduleCacheDirName } = require('../lib/config');
const { patchResponse } = require('../lib/utils/patch');
const path = require('path');
const { ServerResponse } = require('http');

const NODE_PATH = process.env.NODE_PATH;

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
  before(() => {
    process.env.NODE_PATH = 'test/fixtures/www';
    require('module').Module._initPaths();
  });
  afterEach(() => {
    cleanCache();
  });
  after(async () => {
    process.env.NODE_PATH = NODE_PATH;
    require('module').Module._initPaths();
    await destroyWorkers();
  });

  describe('patchResponse()', () => {
    it('should inject script into buffered html response', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, { scriptString: 'test inject' });
      res.end('</body>');
      expect(getBody(res)).to.include('test inject');
    });
    it('should inject script into streamed html response', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, { scriptString: 'test inject' });
      res.write('</body>');
      expect(getBody(res)).to.include('test inject');
    });
    it('should resolve bare js import id', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import lodash from "lodash";');
      expect(getBody(res)).to.equal(
        `import lodash from "/${moduleCacheDirName}/lodash-4.17.10.js";`
      );
    });
    it('should resolve multiple bare js import ids', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end(
        'import lodashArr from "lodash/array";\nimport { foo } from "./foo.js";\nimport debug from "debug";'
      );
      expect(getBody(res)).to.equal(
        `import lodashArr from "/${moduleCacheDirName}/lodash__array-4.17.10.js";\nimport { foo } from "./foo.js";\nimport debug from "/${moduleCacheDirName}/debug-3.1.0.js";`
      );
    });
    it('should resolve NODE_PATH js import id', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      req.filepath = path.resolve('test/fixtures/index.js');
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "nested/index.js";');
      expect(getBody(res)).to.equal(`import module from "../www/nested/index.js";`);
      process.env.NODE_PATH = NODE_PATH;
    });
    it('should resolve js import id missing extension', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "./test/fixtures/www/module";');
      expect(getBody(res)).to.equal(`import module from "./test/fixtures/www/module.js";`);
    });
    it('should resolve js import id missing package index', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "./test/fixtures/www/nested";');
      expect(getBody(res)).to.equal(`import module from "./test/fixtures/www/nested/index.js";`);
    });
  });
});
