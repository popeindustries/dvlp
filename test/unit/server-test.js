import { cleanBundledFiles } from '../../src/utils/bundling.js';
import config from '../../src/config.js';
import EventSource from 'eventsource';
import { expect } from 'chai';
import fetch from 'node-fetch';
import { fileURLToPath } from 'node:url';
import { getBundleFilePath } from './utils.js';
import http from 'node:http';
import http2 from 'node:http2';
import path from 'node:path';
import { platform } from 'node:os';
import { server as serverFactory } from '../../src/dvlp.js';
import websocket from 'faye-websocket';

const { Client: WebSocket } = websocket;
let es, server, ws;

describe('server', () => {
  beforeEach(() => {
    cleanBundledFiles();
  });
  afterEach(async () => {
    config.directories = [process.cwd()];
    cleanBundledFiles();
    if (es) {
      es.removeAllListeners();
      es.close();
      es = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    server && (await server.destroy());
  });

  describe('static', () => {
    it('should implicitly serve index.html', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('<!doctype html>');
    });
    it('should implicitly serve index.html from sub-directory', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/nested', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('Test Nested');
    });
    it('should rewrite request for missing html files to index.html ', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const res = await fetch('http://localhost:8100/0', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('<!doctype html>');
    });
    it('should serve a css file with correct mime type', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const res = await fetch('http://localhost:8100/style.css');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('text/css');
    });
    it('should serve a js file with correct mime type', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const res = await fetch('http://localhost:8100/script.js');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/javascript');
    });
    it('should serve a js file with missing extension with correct mime type', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const res = await fetch('http://localhost:8100/script');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/javascript');
    });
    it('should serve a js package file with correct mime type', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const res = await fetch('http://localhost:8100/nested');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/javascript');
    });
    it('should serve a bundled module js file with correct mime type', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const href = getBundleFilePath('debug');
      const res = await fetch(`http://localhost:8100/${href}`);
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/javascript');
    });
    it('should serve a node_modules js file with correct mime type', async () => {
      server = await serverFactory('test/unit/fixtures', { port: 8100 });
      const res = await fetch(`http://localhost:8100/foo/foo.js`);
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/javascript');
      const body = await res.text();
      expect(body).to.contain("console.log('this is foo');");
    });
    it('should serve a font file with correct mime type', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const res = await fetch('http://localhost:8100/font.woff');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('font/woff');
    });
    it('should serve a json file with correct mime type', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const res = await fetch('http://localhost:8100/test.json');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/json');
    });
    it('should serve files from additional directories', async () => {
      server = await serverFactory(
        ['test/unit/fixtures/www', path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/assets')],
        { port: 8100 },
      );
      const res = await fetch('http://localhost:8100/index.css');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('text/css');
      expect(await res.text()).to.match(/body {\s+ background-color: white;\s+}/);
    });
    it('should return 404 for missing file', async () => {
      server = await serverFactory('test/unit/fixtures/www', { port: 8100 });
      const res = await fetch('http://localhost:8100/not.css');
      expect(res.status).to.eql(404);
    });
    it('should inject the reload script into an html response', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: true,
      });
      const res = await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('sse = new EventSource');
    });
    it('should throw on missing path', async () => {
      try {
        server = await serverFactory('www', { port: 8100, reload: false });
        expect(server).to.not.exist;
      } catch (err) {
        expect(err).to.exist;
      }
    });
    it('should transform file content when using an onTransform hook', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: false,
        hooksPath: 'test/unit/fixtures/hooks-transform.mjs',
      });
      const res = await fetch('http://localhost:8100/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('this is transformed content for: style.css');
    });
    it('should transform file content when using an onSend hook', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: false,
        hooksPath: 'test/unit/fixtures/hooks-send.mjs',
      });
      const res = await fetch('http://localhost:8100/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('this is sent content for: style.css');
    });
    it('should handle request when using an onRequest hook', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: false,
        hooksPath: 'test/unit/fixtures/hooks-request.mjs',
      });
      let res = await fetch('http://localhost:8100/favicon.ico');
      expect(res.headers.get('content-type')).to.include('image/x-icon');
      res = await fetch('http://localhost:8100/api');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('handled');
    });
    it('should cache transformed file content when using an onTransform hook', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: false,
        hooksPath: 'test/unit/fixtures/hooks-transform.mjs',
      });
      let start = Date.now();
      let res = await fetch('http://localhost:8100/style.css');
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.above(200);
      start = Date.now();
      res = await fetch('http://localhost:8100/style.css');
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.below(10);
    });
    it('should cache transformed file content by user-agent when using an onTransfrom hook', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: false,
        hooksPath: 'test/unit/fixtures/hooks-transform.mjs',
      });
      let start = Date.now();
      let res = await fetch('http://localhost:8100/style.css', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36',
        },
      });
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.above(200);
      expect(await res.text()).to.equal('this is transformed content for: style.css on Chrome:69');
      start = Date.now();
      res = await fetch('http://localhost:8100/style.css', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Mobile Safari/537.36',
        },
      });
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.above(200);
      expect(await res.text()).to.equal('this is transformed content for: style.css on Chrome Mobile:87');
      start = Date.now();
      res = await fetch('http://localhost:8100/style.css', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Mobile Safari/537.36',
        },
      });
      expect(Date.now() - start).to.be.below(10);
    });
    it('should return error when hooks onTransform error', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        port: 8100,
        reload: false,
        hooksPath: 'test/unit/fixtures/hooks-error.mjs',
      });
      const res = await fetch('http://localhost:8100/style.css');
      expect(res.status).to.eql(500);
      expect(await res.text()).to.equal('transform error style.css');
    });
    it('should respond to mocked requests', async () => {
      server = await serverFactory('test/unit/fixtures/www', {
        mockPath: 'test/unit/fixtures/mock/1234.json',
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/1234.jpg');
      expect(res.status).to.eql(200);
      expect(res.headers.get('content-type')).to.equal('image/jpeg');
    });
    it('should handle mock EventSource connection', (done) => {
      serverFactory('test/unit/fixtures/www', {
        mockPath: 'test/unit/fixtures/mock-push',
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        es = new EventSource('http://localhost:8100?dvlpmock=http%3A%2F%2Flocalhost%3A8111%2Ffeed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          done();
        };
      });
    });
    it('should handle push mock event via EventSource', (done) => {
      serverFactory('test/unit/fixtures/www', {
        mockPath: 'test/unit/fixtures/mock-push',
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        es = new EventSource('http://localhost:8100?dvlpmock=http%3A%2F%2Flocalhost%3A8111%2Ffeed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          fetch('http://localhost:8100/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stream: 'http://localhost:8111/feed',
              event: 'open',
            }),
          });
        };
        es.addEventListener('foo', (event) => {
          expect(event.data).to.equal('{"title":"open"}');
          done();
        });
      });
    });
    it('should handle mock WebSocket connection', (done) => {
      serverFactory('test/unit/fixtures/www', {
        mockPath: 'test/unit/fixtures/mock-push',
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket('ws://localhost:8100?dvlpmock=ws%3A%2F%2Flocalhost%3A8111%2Fsocket');
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          done();
        });
      });
    });
    it('should handle push mock event via WebSocket', (done) => {
      serverFactory('test/unit/fixtures/www', {
        mockPath: 'test/unit/fixtures/mock-push',
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket('ws://localhost:8100?dvlpmock=ws%3A%2F%2Flocalhost%3A8111%2Fsocket');
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          fetch('http://localhost:8100/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stream: 'ws://localhost:8111/socket',
              event: 'foo event',
            }),
          });
        });
        ws.on('message', (event) => {
          expect(event.data).to.equal('{"title":"foo"}');
          done();
        });
      });
    });
  });

  describe('application', () => {
    it('should start a function server', async () => {
      server = await serverFactory(
        () => {
          http
            .createServer((req, res) => {
              res.writeHead(200);
              res.end('hi');
            })
            .listen(8102);
        },
        { port: 8100, reload: false },
      );
      const res = await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    it('should start a function server with additional directories', async () => {
      server = await serverFactory(
        () => {
          http
            .createServer((req, res) => {
              res.writeHead(200);
              res.end('hi');
            })
            .listen(8102);
        },
        { directories: ['test/unit/fixtures/www'], port: 8100, reload: false },
      );
      const res = await fetch('http://localhost:8100/module.js');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('main');
    });
    it('should start an app server', async () => {
      server = await serverFactory('test/unit/fixtures/app.mjs', {
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    it('should start an app server with listen "path"', async () => {
      server = await serverFactory('test/unit/fixtures/app-create-server.mjs', {
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('ok');
    });
    it('should start an app server with additional directories', async () => {
      server = await serverFactory(['test/unit/fixtures/www', 'test/unit/fixtures/app.mjs'], {
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/module.js');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('main');
    });
    it('should start an app server listening for "request" event', async () => {
      server = await serverFactory('test/unit/fixtures/app-listener.mjs', {
        port: 8100,
      });
      const res = await fetch('http://localhost:8100/', {
        headers: { Accept: 'text/html; charset=utf-8' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('ok');
    });
    it('should start an app server with default server transform', async () => {
      server = await serverFactory('test/unit/fixtures/app.ts', {
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      // expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    if (platform() !== 'win32') {
      it('should start an app server with custom server transform', async () => {
        server = await serverFactory('test/unit/fixtures/app.ts', {
          port: 8100,
          reload: false,
          hooksPath: 'test/unit/fixtures/hooks-transform-server.mjs',
        });
        const res = await fetch('http://localhost:8100/', {
          headers: { accept: 'text/html' },
        });
        expect(res.status).to.eql(200);
        expect(await res.text()).to.contain('hi from body hook');
      });
    }
    it('should polyfill process.env', async () => {
      server = await serverFactory('test/unit/fixtures/app.mjs', { port: 8100 });
      const res = await fetch('http://localhost:8100/', {
        headers: { Accept: 'text/html; charset=utf-8' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain(
        '<script>window.process=window.process||{env:{}};window.process.env.NODE_ENV="dvlptest";\nwindow.DVLP=true;</script>',
      );
    });
    it('should serve a bundled module js file', async () => {
      server = await serverFactory('test/unit/fixtures/app.mjs', { port: 8100 });
      const res = await fetch(`http://localhost:8100/${getBundleFilePath('debug')}`);
      expect(res.status).to.eql(200);
      const body = await res.text();
      expect(body).to.contain('function parse(str)');
      expect(body).to.contain('export_default as default');
    });
    it('should serve a bundled module js file from server listening for "request" event', async () => {
      server = await serverFactory('test/unit/fixtures/app-listener.mjs', {
        port: 8100,
      });
      const res = await fetch(`http://localhost:8100/${getBundleFilePath('debug')}`);
      expect(res.status).to.eql(200);
      const body = await res.text();
      expect(body).to.contain('function parse(str)');
      expect(body).to.contain('export_default as default');
    });
    it('should serve a node_modules module js file', async () => {
      server = await serverFactory('test/unit/fixtures/app.mjs', { port: 8100 });
      const res = await fetch(`http://localhost:8100/node_modules/foo/foo.js`);
      expect(res.status).to.eql(200);
      const body = await res.text();
      expect(body).to.contain("console.log('this is foo')");
    });
    it('should inject the reload script into an html response', async () => {
      server = await serverFactory('test/unit/fixtures/app.mjs', {
        port: 8100,
        reload: true,
      });
      const res = await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('sse = new EventSource');
    });
    it('should start with initial error', async () => {
      server = await serverFactory('test/unit/fixtures/app-error.mjs', {
        port: 8100,
        reload: false,
      });
      await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      const res = await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(500);
      expect(await res.text()).to.eql('application server failed to start');
    });
    it('should handle request error', async () => {
      server = await serverFactory('test/unit/fixtures/app-request-error.mjs', {
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(500);
      expect(await res.text()).to.include('errrrrrrrrrrrr is not defined');
    });
    it('should transform file content when using an onTransform hook', async () => {
      server = await serverFactory('test/unit/fixtures/app.mjs', {
        port: 8100,
        reload: false,
        hooksPath: 'test/unit/fixtures/hooks-transform.mjs',
      });
      const res = await fetch('http://localhost:8100/www/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('this is transformed content for: style.css');
    });
    it('should respond to mocked requests', async () => {
      server = await serverFactory('test/unit/fixtures/app.mjs', {
        mockPath: 'test/unit/fixtures/mock/1234.json',
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100/1234.jpg');
      expect(res.status).to.eql(200);
      expect(res.headers.get('content-type')).to.equal('image/jpeg');
    });
    it('should respond to remote mocked requests', async () => {
      server = await serverFactory('test/unit/fixtures/app-api.mjs', {
        mockPath: 'test/unit/fixtures/mock/9012.json',
        port: 8100,
        reload: false,
      });
      const res = await fetch('http://localhost:8100');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.include('Bob');
    });
    it('should handle mock EventSource connection', (done) => {
      serverFactory('test/unit/fixtures/app.mjs', {
        mockPath: 'test/unit/fixtures/mock-push',
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        es = new EventSource('http://localhost:8100?dvlpmock=http%3A%2F%2Flocalhost%3A8111%2Ffeed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          done();
        };
      });
    });
    it('should handle push mock event via EventSource', (done) => {
      serverFactory('test/unit/fixtures/app.mjs', {
        mockPath: 'test/unit/fixtures/mock-push',
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        es = new EventSource('http://localhost:8100?dvlpmock=http%3A%2F%2Flocalhost%3A8111%2Ffeed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          fetch('http://localhost:8100/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stream: 'http://localhost:8111/feed',
              event: 'open',
            }),
          });
        };
        es.addEventListener('foo', (event) => {
          expect(event.data).to.equal('{"title":"open"}');
          done();
        });
      });
    });
    it('should handle mock WebSocket connection', (done) => {
      serverFactory('test/unit/fixtures/app.mjs', {
        mockPath: 'test/unit/fixtures/mock-push',
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket('ws://localhost:8100?dvlpmock=ws%3A%2F%2Flocalhost%3A8111%2Fsocket');
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          done();
        });
      });
    });
    it('should handle push mock event via WebSocket', (done) => {
      serverFactory('test/unit/fixtures/app.mjs', {
        mockPath: 'test/unit/fixtures/mock-push',
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket('ws://localhost:8100?dvlpmock=ws%3A%2F%2Flocalhost%3A8111%2Fsocket');
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          fetch('http://localhost:8100/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stream: 'ws://localhost:8111/socket',
              event: 'foo event',
            }),
          });
        });
        ws.on('message', (event) => {
          expect(event.data).to.equal('{"title":"foo"}');
          done();
        });
      });
    });
    it.skip('should enable electron mode', async () => {
      server = await serverFactory('test/unit/fixtures/electron/electron-entry.js', {
        electron: true,
        port: 8100,
        reload: false,
      });
      // const res = await fetch('http://localhost:8100/', {
      //   headers: { accept: 'text/html' },
      // });
      // expect(res.status).to.eql(200);
      // expect(await res.text()).to.contain('hi');
    });
  });

  if (!process.env.CI) {
    describe('ssl', () => {
      describe('static', () => {
        it('should implicitly serve index.html over https', async () => {
          server = await serverFactory('test/unit/fixtures/www', {
            certsPath: 'test/unit/fixtures/certificates',
            port: 8100,
            reload: false,
          });
          const res = await fetch('https://localhost:443/');
          expect(res.status).to.eql(200);
          expect(await res.text()).to.contain('<!doctype html>');
        });
        it('should locate .crt and .key files when passed globs', async () => {
          server = await serverFactory('test/unit/fixtures/www', {
            certsPath: 'test/unit/fixtures/certificates/dvlp.*',
            port: 8100,
            reload: false,
          });
          const res = await fetch('https://localhost:443/');
          expect(res.status).to.eql(200);
          expect(await res.text()).to.contain('<!doctype html>');
        });
        it('should handle EventSource connection', (done) => {
          serverFactory('test/unit/fixtures/www', {
            certsPath: 'test/unit/fixtures/certificates',
            mockPath: 'test/unit/fixtures/mock-push',
            port: 8100,
            reload: true,
          }).then((srvr) => {
            server = srvr;
            const client = http2.connect('https://localhost:443');
            const req = client.request({ ':path': '/dvlpreload' });
            req.setEncoding('utf8');
            req.on('data', (chunk) => {
              expect(chunk).to.include('retry: 5000');
              client.destroy();
              done();
            });
            req.end();
          });
        });
        it('should serve a js file with correct mime type over https', async () => {
          server = await serverFactory('test/unit/fixtures/www', {
            certsPath: 'test/unit/fixtures/certificates',
            port: 8100,
            reload: false,
          });
          const res = await fetch('https://localhost:443/script.js');
          expect(res.status).to.eql(200);
          expect(res.headers.get('Content-type')).to.include('application/javascript');
        });
      });
      describe('application', () => {
        it('should start an app server over https', async () => {
          server = await serverFactory('test/unit/fixtures/app.mjs', {
            certsPath: 'test/unit/fixtures/certificates',
            port: 8100,
            reload: false,
          });
          const res = await fetch('https://localhost:443/', {
            headers: { accept: 'text/html' },
          });
          expect(res.status).to.eql(200);
          expect(await res.text()).to.contain('hi');
        });
        it('should serve a node_modules module js file over https', async () => {
          server = await serverFactory('test/unit/fixtures/app.mjs', {
            certsPath: 'test/unit/fixtures/certificates',
            port: 8100,
            reload: false,
          });
          const res = await fetch(`https://localhost:443/node_modules/foo/foo.js`);
          expect(res.status).to.eql(200);
          const body = await res.text();
          expect(body).to.contain("console.log('this is foo')");
        });
      });
    });
  }
});
