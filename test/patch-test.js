'use strict';

const { cleanBundles, destroyWorkers } = require('../lib/utils/bundler');
const { expect } = require('chai');
const { bundleDirName } = require('../lib/config');
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
    filepath: path.resolve('test/fixtures/www', url),
    headers,
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    method: 'GET',
    url
  };
}
function setNodePath(nodePath) {
  process.env.NODE_PATH = nodePath;
  require('module').Module._initPaths();
}

describe('patch', () => {
  afterEach(cleanBundles);
  after(async () => {
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
      expect(getBody(res)).to.equal(`import lodash from "/${bundleDirName}/lodash-4.17.10.js";`);
    });
    it('should resolve multiple bare js import ids', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end(
        'import lodashArr from "lodash/array";\nimport { foo } from "./foo.js";\nimport debug from "debug";'
      );
      expect(getBody(res)).to.equal(
        `import lodashArr from "/${bundleDirName}/lodash__array-4.17.10.js";\nimport { foo } from "./foo.js";\nimport debug from "/${bundleDirName}/debug-3.1.0.js";`
      );
    });
    it('should resolve NODE_PATH js import id', () => {
      setNodePath('test/fixtures/www');
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "nested/index.js";');
      expect(getBody(res)).to.equal(`import module from "./nested/index.js";`);
      setNodePath(NODE_PATH);
    });
    it('should resolve NODE_PATH js import id missing extension', () => {
      setNodePath('test/fixtures/www');
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "nested/foo";');
      expect(getBody(res)).to.equal(`import module from "./nested/foo.jsx";`);
      setNodePath(NODE_PATH);
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
