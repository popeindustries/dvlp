'use strict';

const { brotliCompressSync, gzipSync } = require('zlib');
const { cleanBundles, destroyWorkers } = require('../src/bundler/index.js');
const { clearResolverCache } = require('../src/resolver/index.js');
const config = require('../src/config.js');
const { expect } = require('chai');
const { patchResponse } = require('../src/utils/patch.js');
const path = require('path');
const { ServerResponse } = require('http');

const DEBUG_VERSION = '4.1.1';
const LODASH_VERSION = '4.17.15';
const NODE_PATH = process.env.NODE_PATH;

function getBody(res) {
  const output = (res.output || res.outputData)
    .filter(
      (chunk) =>
        typeof chunk === 'string' || (chunk.data && chunk.data.length > 0),
    )
    .map((chunk) => chunk.data || chunk)
    .join('');
  return output.replace(res._header, '');
}
function getRequest(url, headers = { accept: '*/*' }) {
  return {
    filePath: path.resolve('test/fixtures/www', url),
    headers,
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    method: 'GET',
    url,
  };
}
function getResponse(req) {
  const res = new ServerResponse(req);
  res.metrics = {
    getEvent() {
      return 0;
    },
    recordEvent() {},
  };
  return res;
}
function setNodePath(nodePath) {
  process.env.NODE_PATH = nodePath;
  require('module').Module._initPaths();
}

describe('patch', () => {
  afterEach(() => {
    cleanBundles();
    clearResolverCache();
  });
  after(async () => {
    await destroyWorkers();
  });

  describe('patchResponse()', () => {
    describe('scripts', () => {
      it('should inject footer script into buffered html response', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          footerScript: { string: 'test inject' },
        });
        res.end('</body>');
        expect(getBody(res)).to.equal('<script>test inject</script>\n</body>');
      });
      it('should inject header script into buffered html response', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          headerScript: { string: 'test inject' },
        });
        res.end('<head></head>');
        expect(getBody(res)).to.equal(
          '<head>\n<script>test inject</script></head>',
        );
      });
      it('should inject footer script into streamed html response', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          footerScript: { string: 'test inject' },
        });
        res.write('</body>');
        res.end();
        expect(getBody(res)).to.include(
          '<script>test inject</script>\n</body>',
        );
      });
      it('should inject header script into streamed html response', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          headerScript: { string: 'test inject' },
        });
        res.write('<head></head>');
        res.end();
        expect(getBody(res)).to.include(
          '<head>\n<script>test inject</script></head>',
        );
      });
    });

    describe('headers', () => {
      it('should inject csp header when connect-src', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          footerScript: {
            string: 'test inject',
            url: 'http://localhost:3529/dvlpreload',
          },
          headerScript: {
            string: 'test inject',
          },
        });
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; connect-src 'self'",
        );
        expect(res.getHeader('Content-Security-Policy')).to.equal(
          "default-src 'self'; connect-src 'self' http://localhost:3529/dvlpreload; ",
        );
      });
      it('should inject csp header when no connect-src', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          footerScript: {
            string: 'test inject',
            url: 'http://localhost:3529/dvlpreload',
          },
        });
        res.setHeader('Content-Security-Policy', "default-src 'self'");
        expect(res.getHeader('Content-Security-Policy')).to.equal(
          "default-src 'self'; connect-src http://localhost:3529/dvlpreload; ",
        );
      });
      it('should inject csp header with writeHead when connect-src', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          footerScript: {
            string: 'test inject',
            url: 'http://localhost:3529/dvlpreload',
          },
        });
        res.writeHead(200, {
          'Content-Security-Policy': "default-src 'self'; connect-src 'self'",
        });
        expect(res._header).to.contain(
          "default-src 'self'; connect-src 'self' http://localhost:3529/dvlpreload; ",
        );
      });
      it('should inject csp header with writeHead when no connect-src', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          footerScript: {
            string: 'test inject',
            url: 'http://localhost:3529/dvlpreload',
          },
        });
        res.writeHead(200, { 'Content-Security-Policy': "default-src 'self'" });
        expect(res._header).to.contain(
          "default-src 'self'; connect-src http://localhost:3529/dvlpreload; ",
        );
      });
      it('should not inject script hash in csp header when no nonce/sha and unsafe-inline', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          footerScript: {
            string: 'test inject',
            url: 'http://localhost:3529/dvlpreload',
          },
        });
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline'",
        );
        expect(res.getHeader('Content-Security-Policy')).to.equal(
          "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src http://localhost:3529/dvlpreload; ",
        );
      });
      it('should inject script hash in csp header when no nonce/sha and missing unsafe-inline', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filepath, req, res, {
          footerScript: {
            hash: 'xxxxxx',
            string: 'test inject',
            url: 'http://localhost:3529/dvlpreload',
          },
          headerScript: {
            hash: 'yyyyyy',
            string: 'test inject',
          },
        });
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self'",
        );
        expect(res.getHeader('Content-Security-Policy')).to.equal(
          "default-src 'self'; script-src 'self' 'sha256-xxxxxx' 'sha256-yyyyyy'; connect-src http://localhost:3529/dvlpreload; ",
        );
      });
      it('should inject script hash in csp header when nonce', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filepath, req, res, {
          footerScript: {
            hash: 'xxxxxx',
            string: 'test inject',
            url: 'http://localhost:3529/dvlpreload',
          },
          headerScript: {
            hash: 'yyyyyy',
            string: 'test inject',
          },
        });
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-foo'",
        );
        expect(res.getHeader('Content-Security-Policy')).to.equal(
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-foo' 'sha256-xxxxxx' 'sha256-yyyyyy'; connect-src http://localhost:3529/dvlpreload; ",
        );
      });
      it('should inject script hash in csp header when sha', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filepath, req, res, {
          footerScript: {
            hash: 'xxxxxx',
            string: 'test inject',
            url: 'http://localhost:3529/dvlpreload',
          },
          headerScript: {
            hash: 'yyyyyy',
            string: 'test inject',
          },
        });
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'sha512-yyyyyy'",
        );
        expect(res.getHeader('Content-Security-Policy')).to.equal(
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'sha512-yyyyyy' 'sha256-xxxxxx' 'sha256-yyyyyy'; connect-src http://localhost:3529/dvlpreload; ",
        );
      });
      it('should disable cache-control headers for local files', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.setHeader('Cache-Control', 'max-age=600');
        res.end('done');
        expect(res.getHeader('Cache-Control')).to.equal(
          'no-cache, dvlp-disabled',
        );
      });
      it('should disable cache-control headers for local files when cache-control not set', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('done');
        expect(res.getHeader('Cache-Control')).to.equal(
          'no-cache, dvlp-disabled',
        );
      });
      it('should not disable cache-control headers for node_modules files', () => {
        const req = getRequest('/node_modules/foo');
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.setHeader('Cache-Control', 'max-age=600');
        res.end('done');
        expect(res.getHeader('Cache-Control')).to.equal('max-age=600');
      });
      it('should enable cross origin headers', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('done');
        expect(res.getHeader('Access-Control-Allow-Origin')).to.equal('*');
      });
    });

    describe('rewrite imports', () => {
      it('should not resolve valid relative js import id', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import "./body.js";');
        expect(getBody(res)).to.equal(`import "./body.js";`);
      });
      it('should resolve bare js import id', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import lodash from "lodash";');
        expect(getBody(res)).to.equal(
          `import lodash from "/${config.bundleDirName}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should escape "$" when resolving js import id', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import $$observable from "lodash";');
        expect(getBody(res)).to.equal(
          `import $$observable from "/${config.bundleDirName}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should resolve import at the start of a line', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end(`const foo = 'bar'\nimport lodash from "lodash";`);
        expect(getBody(res)).to.equal(
          `const foo = 'bar'\nimport lodash from "/${config.bundleDirName}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should resolve import following a semi-colon', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end(
          `function foo(value) { return value; };import lodash from "lodash";`,
        );
        expect(getBody(res)).to.equal(
          `function foo(value) { return value; };import lodash from "/${config.bundleDirName}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should resolve import following a closing curly bracket', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end(
          `function foo(value) { return value; } import lodash from "lodash";`,
        );
        expect(getBody(res)).to.equal(
          `function foo(value) { return value; } import lodash from "/${config.bundleDirName}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should resolve import following a closing parethesis', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end(`const foo = ('bar') import lodash from "lodash";`);
        expect(getBody(res)).to.equal(
          `const foo = ('bar') import lodash from "/${config.bundleDirName}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should not resolve import following an invalid character', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        const reactDomError = `error("It looks like you're using the wrong act() around your test interactions.\n" + 'Be sure to use the matching version of act() corresponding to your renderer:\n\n' + '// for react-dom:\n' + "import {act} from 'react-dom/test-utils';\n" + '// ...\n' + 'act(() => ...);\n\n' + '// for react-test-renderer:\n' + "import TestRenderer from 'react-test-renderer';\n" + 'const {act} = TestRenderer;\n' + '// ...\n' + 'act(() => ...);' + '%s', getStackByFiberInDevAndProd(fiber));`;
        patchResponse(req.filePath, req, res);
        res.end(reactDomError);
        expect(getBody(res)).to.equal(reactDomError);
      });
      it('should resolve multiple bare js import ids', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end(
          'import lodashArr from "lodash/array";\nimport { foo } from "./foo.js";\nimport debug from "debug";',
        );
        expect(getBody(res)).to.equal(
          `import lodashArr from "/${config.bundleDirName}/lodash__array-${LODASH_VERSION}.js";\nimport { foo } from "./foo.js";\nimport debug from "/${config.bundleDirName}/debug-${DEBUG_VERSION}.js";`,
        );
      });
      it('should resolve bare js import id for es module', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import { html } from "lit-html";');
        expect(getBody(res)).to.equal(
          `import { html } from "${process.cwd()}/node_modules/lit-html/lit-html.js";`,
        );
      });
      it('should resolve NODE_PATH js import id', () => {
        setNodePath('test/fixtures/www');
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import module from "nested/index.js";');
        expect(getBody(res)).to.equal(
          `import module from "${process.cwd()}/test/fixtures/www/nested/index.js";`,
        );
        setNodePath(NODE_PATH);
      });
      it('should resolve NODE_PATH js import id missing extension', () => {
        setNodePath('test/fixtures/www');
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import module from "nested/foo";');
        expect(getBody(res)).to.equal(
          `import module from "${process.cwd()}/test/fixtures/www/nested/foo.jsx";`,
        );
        setNodePath(NODE_PATH);
      });
      it('should resolve js import id missing extension', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import module from "./test/fixtures/www/module";');
        expect(getBody(res)).to.equal(
          `import module from "${process.cwd()}/test/fixtures/www/module.js";`,
        );
      });
      it('should resolve jsx import id missing extension', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import component from "./test/fixtures/component";');
        expect(getBody(res)).to.equal(
          `import component from "${process.cwd()}/test/fixtures/component.jsx";`,
        );
      });
      it('should resolve ts import id missing extension', () => {
        const req = getRequest('/index.ts', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import route from "./test/fixtures/route";');
        expect(getBody(res)).to.equal(
          `import route from "${process.cwd()}/test/fixtures/route.ts";`,
        );
      });
      it('should resolve js import id missing package index', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import module from "./test/fixtures/www/nested";');
        expect(getBody(res)).to.equal(
          `import module from "${process.cwd()}/test/fixtures/www/nested/index.js";`,
        );
      });
      it('should resolve ts import id missing package index', () => {
        const req = getRequest('/index.ts', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import module from "./test/fixtures/www/nested-ts";');
        expect(getBody(res)).to.equal(
          `import module from "${process.cwd()}/test/fixtures/www/nested-ts/index.ts";`,
        );
      });
      it('should ignore erroneous "import" string', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('"this is use of a fake import text"');
        expect(getBody(res)).to.equal(`"this is use of a fake import text"`);
      });
      it('should resolve js import with browser field', () => {
        const req = getRequest('/test/fixtures/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import "bar";');
        expect(getBody(res)).to.equal(
          `import "${process.cwd()}/test/fixtures/node_modules/bar/browser.js";`,
        );
      });
      it('should resolve js import with browser field map', () => {
        const req = getRequest('/test/fixtures/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res);
        res.end('import "bat";');
        expect(getBody(res)).to.equal(
          `import "${process.cwd()}/test/fixtures/node_modules/bat/browser.js";`,
        );
      });
    });

    it('should uncompress gzipped html response', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = getResponse(req);
      patchResponse(req.filePath, req, res, {
        headerScript: { string: 'test inject' },
      });
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipSync(Buffer.from('<head></head>')));
      expect(getBody(res)).to.equal(
        '<head>\n<script>test inject</script></head>',
      );
    });
    it('should uncompress gzipped css response', () => {
      const req = getRequest('/index.css');
      const res = getResponse(req);
      patchResponse(req.filePath, req, res);
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipSync(Buffer.from('body { backgroundColor: #fff; }')));
      expect(getBody(res)).to.equal('body { backgroundColor: #fff; }');
    });
    it('should uncompress brotli compressed html response', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = getResponse(req);
      patchResponse(req.filePath, req, res, {
        headerScript: { string: 'test inject' },
      });
      res.setHeader('Content-Encoding', 'br');
      res.end(brotliCompressSync(Buffer.from('<head></head>')));
      expect(getBody(res)).to.equal(
        '<head>\n<script>test inject</script></head>',
      );
    });
  });
});
