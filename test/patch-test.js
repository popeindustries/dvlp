import { brotliCompressSync, gzipSync } from 'zlib';
import { clearResolverCache } from '../src/resolver/index.js';
import config from '../src/config.js';
import { expect } from 'chai';
import Hooks from '../src/hooks/index.js';
import { patchResponse } from '../src/utils/patch.js';
import path from 'path';
import { ServerResponse } from 'http';

const DEBUG_VERSION = '4.3.1';
const LODASH_VERSION = '4.17.20';
const NODE_PATH = process.env.NODE_PATH;

const cwd = process
  .cwd()
  .replace(/^[A-Z]:\\/, '/')
  .replace(/\\/g, '/');
const bundleDir = config.bundleDirName.replace(/\\/g, '/');
const hooks = new Hooks();

function getBody(res) {
  const output = (res.output || res.outputData)
    .filter((chunk) => typeof chunk === 'string' || (chunk.data && chunk.data.length > 0))
    .map((chunk) => chunk.data || chunk)
    .join('');
  return output.replace(res._header, '');
}
function getRequest(url, headers = { accept: '*/*' }) {
  return {
    filePath: path.resolve(path.join('test/fixtures/www', url)),
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
    clearResolverCache();
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
        expect(getBody(res)).to.equal('<head>\n<script>test inject</script></head>');
      });
      it('should inject footer script into streamed html response', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          footerScript: { string: 'test inject' },
        });
        res.write('</body>');
        res.end();
        expect(getBody(res)).to.include('<script>test inject</script>\n</body>');
      });
      it('should inject header script into streamed html response', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          headerScript: { string: 'test inject' },
        });
        res.write('<head></head>');
        res.end();
        expect(getBody(res)).to.include('<head>\n<script>test inject</script></head>');
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
        res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'");
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
        expect(res._header).to.contain("default-src 'self'; connect-src 'self' http://localhost:3529/dvlpreload; ");
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
        expect(res._header).to.contain("default-src 'self'; connect-src http://localhost:3529/dvlpreload; ");
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
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
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
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'");
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
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-foo'");
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
        patchResponse(req.filePath, req, res, {});
        res.setHeader('Cache-Control', 'max-age=600');
        res.end('done');
        expect(res.getHeader('Cache-Control')).to.equal('no-cache, dvlp-disabled');
      });
      it('should disable cache-control headers for local files when cache-control not set', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {});
        res.end('done');
        expect(res.getHeader('Cache-Control')).to.equal('no-cache, dvlp-disabled');
      });
      it('should not disable cache-control headers for node_modules files', () => {
        const req = getRequest('/node_modules/foo');
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {});
        res.setHeader('Cache-Control', 'max-age=600');
        res.end('done');
        expect(res.getHeader('Cache-Control')).to.equal('max-age=600');
      });
      it('should enable cross origin headers', () => {
        const req = getRequest('/index.html', { accept: 'text/html' });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {});
        res.end('done');
        expect(res.getHeader('Access-Control-Allow-Origin')).to.equal('*');
      });
    });

    describe('rewrite imports', () => {
      it('should resolve valid relative js import id', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import "./module.js";');
        expect(getBody(res)).to.equal(`import "${cwd}/test/fixtures/www/module.js";`);
      });
      it('should resolve bare js import id', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import lodash from "lodash";');
        expect(getBody(res)).to.equal(`import lodash from "/${bundleDir}/lodash-${LODASH_VERSION}.js";`);
      });
      it('should escape "$" when resolving js import id', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import $$observable from "lodash";');
        expect(getBody(res)).to.equal(`import $$observable from "/${bundleDir}/lodash-${LODASH_VERSION}.js";`);
      });
      it('should resolve import at the start of a line', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end(`const foo = 'bar'\nimport lodash from "lodash";`);
        expect(getBody(res)).to.equal(
          `const foo = 'bar'\nimport lodash from "/${bundleDir}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should resolve import following a semi-colon', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end(`function foo(value) { return value; };import lodash from "lodash";`);
        expect(getBody(res)).to.equal(
          `function foo(value) { return value; };import lodash from "/${bundleDir}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should resolve import following a closing curly bracket', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end(`function foo(value) { return value; } import lodash from "lodash";`);
        expect(getBody(res)).to.equal(
          `function foo(value) { return value; } import lodash from "/${bundleDir}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should resolve import following a closing parethesis', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end(`const foo = ('bar') import lodash from "lodash";`);
        expect(getBody(res)).to.equal(
          `const foo = ('bar') import lodash from "/${bundleDir}/lodash-${LODASH_VERSION}.js";`,
        );
      });
      it('should not resolve import following an invalid character', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        const reactDomError = `error("It looks like you're using the wrong act() around your test interactions.\n" + 'Be sure to use the matching version of act() corresponding to your renderer:\n\n' + '// for react-dom:\n' + "import {act} from 'react-dom/test-utils';\n" + '// ...\n' + 'act(() => ...);\n\n' + '// for react-test-renderer:\n' + "import TestRenderer from 'react-test-renderer';\n" + 'const {act} = TestRenderer;\n' + '// ...\n' + 'act(() => ...);' + '%s', getStackByFiberInDevAndProd(fiber));`;
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end(reactDomError);
        expect(getBody(res)).to.equal(reactDomError);
      });
      it('should resolve multiple bare js import ids', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import lodashArr from "lodash/array";\nimport { foo } from "./foo.js";\nimport debug from "debug";');
        expect(getBody(res)).to.equal(
          `import lodashArr from "/${bundleDir}/lodash__array-${LODASH_VERSION}.js";\nimport { foo } from "./foo.js";\nimport debug from "/${bundleDir}/debug-${DEBUG_VERSION}.js";`,
        );
      });
      it('should resolve bare js import id for es module', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import { html } from "lit-html";');
        expect(getBody(res)).to.equal(`import { html } from "${cwd}/node_modules/lit-html/lit-html.js";`);
      });
      it.skip('should resolve NODE_PATH js import id', () => {
        setNodePath('test/fixtures');
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import module from "app.js";');
        expect(getBody(res)).to.equal(`import module from "${cwd}/test/fixtures/app.js";`);
        setNodePath(NODE_PATH);
      });
      it.skip('should resolve NODE_PATH js import id missing extension', () => {
        setNodePath('test/fixtures');
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import module from "app";');
        expect(getBody(res)).to.equal(`import module from "${cwd}/test/fixtures/app.js";`);
        setNodePath(NODE_PATH);
      });
      it('should resolve js import id missing extension', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import module from "./module";');
        expect(getBody(res)).to.equal(`import module from "${cwd}/test/fixtures/www/module.js";`);
      });
      it('should resolve jsx import id missing extension', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import component from "../component";');
        expect(getBody(res)).to.equal(`import component from "${cwd}/test/fixtures/component.jsx";`);
      });
      it('should resolve ts import id missing extension', () => {
        const req = getRequest('/index.ts', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import route from "../route";');
        expect(getBody(res)).to.equal(`import route from "${cwd}/test/fixtures/route.ts";`);
      });
      it('should resolve js import id missing package index', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import module from "./nested";');
        expect(getBody(res)).to.equal(`import module from "${cwd}/test/fixtures/www/nested/index.js";`);
      });
      it('should resolve ts import id missing package index', () => {
        const req = getRequest('/index.ts', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import module from "./nested-ts";');
        expect(getBody(res)).to.equal(`import module from "${cwd}/test/fixtures/www/nested-ts/index.ts";`);
      });
      it('should ignore erroneous "import" string', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('"this is use of a fake import text"');
        expect(getBody(res)).to.equal(`"this is use of a fake import text"`);
      });
      it('should resolve js import with browser field', () => {
        const req = getRequest('/test/fixtures/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import "bar";');
        expect(getBody(res)).to.equal(`import "${cwd}/test/fixtures/node_modules/bar/browser.js";`);
      });
      it('should resolve js import with browser field map', () => {
        const req = getRequest('/test/fixtures/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import "bat";');
        expect(getBody(res)).to.equal(`import "${cwd}/test/fixtures/node_modules/bat/browser.js";`);
      });
      it('should resolve js dynamic import()', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: hooks.resolveImport,
        });
        res.end('import lodashArr from "lodash/array";\nimport(foo);\nimport("debug");\n');
        expect(getBody(res)).to.equal(
          `import lodashArr from "/${bundleDir}/lodash__array-${LODASH_VERSION}.js";\nimport(foo);\nimport("/${bundleDir}/debug-${DEBUG_VERSION}.js");\n`,
        );
      });
      it('should resolve js import with resolve hook', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: (specifier, context, defaultResolve) => {
            expect(context.isDynamic).to.equal(false);
            return `test/fixtures/www/${specifier}.js`;
          },
        });
        res.end('import "module"');
        expect(getBody(res)).to.equal(`import "${cwd}/test/fixtures/www/module.js"`);
      });
      it('should resolve js import with resolve hook using defaultResolve', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: (specifier, context, defaultResolve) => {
            return defaultResolve(specifier, context.importer);
          },
        });
        res.end('import "./module.js"');
        expect(getBody(res)).to.equal(`import "${cwd}/test/fixtures/www/module.js"`);
      });
      it('should resolve js dynamic import with resolve hook', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: (specifier, context, defaultResolve) => {
            expect(context.isDynamic).to.equal(true);
            return `./test/fixtures/www/${specifier}.js`;
          },
        });
        res.end('import("module");');
        expect(getBody(res)).to.equal(`import("${cwd}/test/fixtures/www/module.js");`);
      });
      it('should replace js dynamic import expression with resolve hook return value', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: (specifier, context, defaultResolve) => {
            return `dynamicImport('${specifier}')`;
          },
        });
        res.end('import("module");');
        expect(getBody(res)).to.equal(`dynamicImport('module');`);
      });
      it('should replace js dynamic import expression with resolve hook return value, including optional arguments', () => {
        const req = getRequest('/index.js', {
          accept: 'application/javascript',
        });
        const res = getResponse(req);
        patchResponse(req.filePath, req, res, {
          resolveImport: (specifier, context, defaultResolve) => {
            return `dynamicImport('./test/fixtures/www/${specifier}.js', '/index.js')`;
          },
        });
        res.end('import("module");');
        expect(getBody(res)).to.equal(`dynamicImport('./test/fixtures/www/module.js', '/index.js');`);
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
      expect(getBody(res)).to.equal('<head>\n<script>test inject</script></head>');
    });
    it('should uncompress gzipped css response', () => {
      const req = getRequest('/index.css');
      const res = getResponse(req);
      patchResponse(req.filePath, req, res, {});
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
      expect(getBody(res)).to.equal('<head>\n<script>test inject</script></head>');
    });
  });
});
