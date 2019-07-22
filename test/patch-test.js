'use strict';

const { cleanBundles, destroyWorkers } = require('../lib/bundler/index.js');
const { clearResolverCache } = require('../lib/resolver/index.js');
const config = require('../lib/config.js');
const { expect } = require('chai');
const { gzipSync } = require('zlib');
const { patchResponse } = require('../lib/utils/patch.js');
const path = require('path');
const { ServerResponse } = require('http');

const NODE_PATH = process.env.NODE_PATH;

function getBody(res) {
  const output = (res.output || res.outputData)
    .filter(
      (chunk) =>
        typeof chunk === 'string' || (chunk.data && chunk.data.length > 0)
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
    url
  };
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
    it('should inject footer script into buffered html response', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        footerScript: { string: 'test inject' }
      });
      res.end('</body>');
      expect(getBody(res)).to.equal('<script>test inject</script>\n</body>');
    });
    it('should inject header script into buffered html response', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        headerScript: { string: 'test inject' }
      });
      res.end('<head></head>');
      expect(getBody(res)).to.equal(
        '<head>\n<script>test inject</script></head>'
      );
    });
    it('should uncompress gzipped html response', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        headerScript: { string: 'test inject' }
      });
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipSync(Buffer.from('<head></head>')));
      expect(getBody(res)).to.equal(
        '<head>\n<script>test inject</script></head>'
      );
    });
    it('should uncompress gzipped css response', () => {
      const req = getRequest('/index.css');
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipSync(Buffer.from('body { backgroundColor: #fff; }')));
      expect(getBody(res)).to.equal('body { backgroundColor: #fff; }');
    });
    it('should inject footer script into streamed html response', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        footerScript: { string: 'test inject' }
      });
      res.write('</body>');
      res.end();
      expect(getBody(res)).to.include('<script>test inject</script>\n</body>');
    });
    it('should inject header script into streamed html response', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        headerScript: { string: 'test inject' }
      });
      res.write('<head></head>');
      res.end();
      expect(getBody(res)).to.include(
        '<head>\n<script>test inject</script></head>'
      );
    });
    it('should inject csp header when connect-src', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        footerScript: {
          string: 'test inject',
          url: 'http://localhost:3529/dvlpreload'
        },
        headerScript: {
          string: 'test inject'
        }
      });
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; connect-src 'self'"
      );
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; connect-src 'self' http://localhost:3529/dvlpreload; "
      );
    });
    it('should inject csp header when no connect-src', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        footerScript: {
          string: 'test inject',
          url: 'http://localhost:3529/dvlpreload'
        }
      });
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; connect-src http://localhost:3529/dvlpreload; "
      );
    });
    it('should inject csp header with writeHead when connect-src', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        footerScript: {
          string: 'test inject',
          url: 'http://localhost:3529/dvlpreload'
        }
      });
      res.writeHead(200, {
        'Content-Security-Policy': "default-src 'self'; connect-src 'self'"
      });
      expect(res._header).to.contain(
        "default-src 'self'; connect-src 'self' http://localhost:3529/dvlpreload; "
      );
    });
    it('should inject csp header with writeHead when no connect-src', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        footerScript: {
          string: 'test inject',
          url: 'http://localhost:3529/dvlpreload'
        }
      });
      res.writeHead(200, { 'Content-Security-Policy': "default-src 'self'" });
      expect(res._header).to.contain(
        "default-src 'self'; connect-src http://localhost:3529/dvlpreload; "
      );
    });
    it('should not inject script hash in csp header when no nonce/sha and unsafe-inline', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res, {
        footerScript: {
          string: 'test inject',
          url: 'http://localhost:3529/dvlpreload'
        }
      });
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'"
      );
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src http://localhost:3529/dvlpreload; "
      );
    });
    it('should inject script hash in csp header when no nonce/sha and missing unsafe-inline', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filepath, req, res, {
        footerScript: {
          hash: 'xxxxxx',
          string: 'test inject',
          url: 'http://localhost:3529/dvlpreload'
        },
        headerScript: {
          hash: 'yyyyyy',
          string: 'test inject'
        }
      });
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'"
      );
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; script-src 'self' 'sha256-xxxxxx' 'sha256-yyyyyy'; connect-src http://localhost:3529/dvlpreload; "
      );
    });
    it('should inject script hash in csp header when nonce', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filepath, req, res, {
        footerScript: {
          hash: 'xxxxxx',
          string: 'test inject',
          url: 'http://localhost:3529/dvlpreload'
        },
        headerScript: {
          hash: 'yyyyyy',
          string: 'test inject'
        }
      });
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-foo'"
      );
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-foo' 'sha256-xxxxxx' 'sha256-yyyyyy'; connect-src http://localhost:3529/dvlpreload; "
      );
    });
    it('should inject script hash in csp header when sha', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filepath, req, res, {
        footerScript: {
          hash: 'xxxxxx',
          string: 'test inject',
          url: 'http://localhost:3529/dvlpreload'
        },
        headerScript: {
          hash: 'yyyyyy',
          string: 'test inject'
        }
      });
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'sha512-yyyyyy'"
      );
      expect(res.getHeader('Content-Security-Policy')).to.equal(
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'sha512-yyyyyy' 'sha256-xxxxxx' 'sha256-yyyyyy'; connect-src http://localhost:3529/dvlpreload; "
      );
    });
    it('should disable cache-control headers for local files', () => {
      const req = getRequest('/index.html', { accept: 'text/html' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.setHeader('Cache-Control', 'max-age=600');
      expect(res.getHeader('Cache-Control')).to.equal(
        'no-cache, dvlp-disabled'
      );
    });
    it('should not disable cache-control headers for node_modules files', () => {
      const req = getRequest('/node_modules/foo');
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.setHeader('Cache-Control', 'max-age=600');
      expect(res.getHeader('Cache-Control')).to.equal('max-age=600');
    });
    it('should not resolve valid relative js import id', () => {
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import "./body.js";');
      expect(getBody(res)).to.equal(`import "./body.js";`);
    });
    it('should resolve bare js import id', () => {
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import lodash from "lodash";');
      expect(getBody(res)).to.equal(
        `import lodash from "/${config.bundleDirName}/lodash-4.17.15.js";`
      );
    });
    it('should resolve multiple bare js import ids', () => {
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end(
        'import lodashArr from "lodash/array";\nimport { foo } from "./foo.js";\nimport debug from "debug";'
      );
      expect(getBody(res)).to.equal(
        `import lodashArr from "/${config.bundleDirName}/lodash__array-4.17.15.js";\nimport { foo } from "./foo.js";\nimport debug from "/${config.bundleDirName}/debug-4.1.1.js";`
      );
    });
    it('should resolve bare js import id for es module', () => {
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import { html } from "lit-html";');
      expect(getBody(res)).to.equal(
        `import { html } from "/node_modules/lit-html/lit-html.js";`
      );
    });
    it('should resolve NODE_PATH js import id', () => {
      setNodePath('test/fixtures/www');
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import module from "nested/index.js";');
      expect(getBody(res)).to.equal(
        `import module from "/test/fixtures/www/nested/index.js";`
      );
      setNodePath(NODE_PATH);
    });
    it('should resolve NODE_PATH js import id missing extension', () => {
      setNodePath('test/fixtures/www');
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import module from "nested/foo";');
      expect(getBody(res)).to.equal(
        `import module from "/test/fixtures/www/nested/foo.jsx";`
      );
      setNodePath(NODE_PATH);
    });
    it('should resolve js import id missing extension', () => {
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import module from "./test/fixtures/www/module";');
      expect(getBody(res)).to.equal(
        `import module from "/test/fixtures/www/module.js";`
      );
    });
    it('should resolve jsx import id missing extension', () => {
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import component from "./test/fixtures/component";');
      expect(getBody(res)).to.equal(
        `import component from "/test/fixtures/component.jsx";`
      );
    });
    it('should resolve ts import id missing extension', () => {
      const req = getRequest('/index.ts', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import route from "./test/fixtures/route";');
      expect(getBody(res)).to.equal(
        `import route from "/test/fixtures/route.ts";`
      );
    });
    it('should resolve js import id missing package index', () => {
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import module from "./test/fixtures/www/nested";');
      expect(getBody(res)).to.equal(
        `import module from "/test/fixtures/www/nested/index.js";`
      );
    });
    it('should resolve ts import id missing package index', () => {
      const req = getRequest('/index.ts', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import module from "./test/fixtures/www/nested-ts";');
      expect(getBody(res)).to.equal(
        `import module from "/test/fixtures/www/nested-ts/index.ts";`
      );
    });
    it('should ignore erroneous "import" string', () => {
      const req = getRequest('/index.js', { accept: 'application/javascript' });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('"this is use of a fake import text"');
      expect(getBody(res)).to.equal(`"this is use of a fake import text"`);
    });
    it('should resolve js import with browser field', () => {
      const req = getRequest('/test/fixtures/index.js', {
        accept: 'application/javascript'
      });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import "bar";');
      expect(getBody(res)).to.equal(
        `import "/test/fixtures/node_modules/bar/browser.js";`
      );
    });
    it('should resolve js import with browser field map', () => {
      const req = getRequest('/test/fixtures/index.js', {
        accept: 'application/javascript'
      });
      const res = new ServerResponse(req);
      patchResponse(req.filePath, req, res);
      res.end('import "bat";');
      expect(getBody(res)).to.equal(
        `import "/test/fixtures/node_modules/bat/browser.js";`
      );
    });
  });
});
