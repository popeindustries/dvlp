'use strict';

const { cleanBundles, destroyWorkers } = require('../lib/utils/bundler');
const { expect } = require('chai');
const { bundleDirName } = require('../lib/config');
const { patchResponse } = require('../lib/utils/patch');
const path = require('path');
const { ServerResponse } = require('http');

const NODE_PATH = process.env.NODE_PATH;

function getBody(res) {
  const output = res.output
    .filter((chunk) => typeof chunk === 'string')
    .join('');
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
    it('should inject csp header when connect-src', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, {
        scriptString: 'test inject',
        scriptUrl: 'http://localhost:3529/dvlpreload'
      });
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; connect-src 'self'"
      );
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; connect-src 'self' http://localhost:3529/dvlpreload; script-src 'sha256-luLMma8jH4Jlp1fvgogNlmlmmvHzbKn900p4cSmKTjo='; "
      );
    });
    it('should inject csp header when no connect-src', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, {
        scriptString: 'test inject',
        scriptUrl: 'http://localhost:3529/dvlpreload'
      });
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; connect-src http://localhost:3529/dvlpreload; script-src 'sha256-luLMma8jH4Jlp1fvgogNlmlmmvHzbKn900p4cSmKTjo='; "
      );
    });
    it('should inject csp header with writeHead when connect-src', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, {
        scriptString: 'test inject',
        scriptUrl: 'http://localhost:3529/dvlpreload'
      });
      res.writeHead(200, {
        'Content-Security-Policy': "default-src 'self'; connect-src 'self'"
      });
      expect(res._header).to.contain(
        "default-src 'self'; connect-src 'self' http://localhost:3529/dvlpreload; script-src 'sha256-luLMma8jH4Jlp1fvgogNlmlmmvHzbKn900p4cSmKTjo='; "
      );
    });
    it('should inject csp header with writeHead when no connect-src', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, {
        scriptString: 'test inject',
        scriptUrl: 'http://localhost:3529/dvlpreload'
      });
      res.writeHead(200, { 'Content-Security-Policy': "default-src 'self'" });
      expect(res._header).to.contain(
        "default-src 'self'; connect-src http://localhost:3529/dvlpreload; script-src 'sha256-luLMma8jH4Jlp1fvgogNlmlmmvHzbKn900p4cSmKTjo='; "
      );
    });
    it('should not inject script hash in csp header when "unsafe-inline"', () => {
      const req = getRequest('index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req, res, {
        scriptString: 'test inject',
        scriptUrl: 'http://localhost:3529/dvlpreload'
      });
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'"
      );
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src http://localhost:3529/dvlpreload; "
      );
    });
    it('should resolve bare js import id', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import lodash from "lodash";');
      expect(getBody(res)).to.equal(
        `import lodash from "/${bundleDirName}/lodash-4.17.11.js";`
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
        `import lodashArr from "/${bundleDirName}/lodash__array-4.17.11.js";\nimport { foo } from "./foo.js";\nimport debug from "/${bundleDirName}/debug-4.1.0.js";`
      );
    });
    it('should resolve bare js import id for es module', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import { html } from "lit-html";');
      expect(getBody(res)).to.equal(
        `import { html } from "./test/fixtures/node_modules/lit-html/lit-html.js";`
      );
    });
    it('should resolve NODE_PATH js import id', () => {
      setNodePath('test/fixtures/www');
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "nested/index.js";');
      expect(getBody(res)).to.equal(
        `import module from "./test/fixtures/www/nested/index.js";`
      );
      setNodePath(NODE_PATH);
    });
    it('should resolve NODE_PATH js import id missing extension', () => {
      setNodePath('test/fixtures/www');
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "nested/foo";');
      expect(getBody(res)).to.equal(
        `import module from "./test/fixtures/www/nested/foo.jsx";`
      );
      setNodePath(NODE_PATH);
    });
    it('should resolve js import id missing extension', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "./test/fixtures/www/module";');
      expect(getBody(res)).to.equal(
        `import module from "./test/fixtures/www/module.js";`
      );
    });
    it('should resolve js import id missing package index', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('import module from "./test/fixtures/www/nested";');
      expect(getBody(res)).to.equal(
        `import module from "./test/fixtures/www/nested/index.js";`
      );
    });
    it('should ignore erroneous "import" string', () => {
      const req = getRequest('index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req, res);
      res.end('"this is use of a fake import text"');
      expect(getBody(res)).to.equal(`"this is use of a fake import text"`);
    });
  });
});
