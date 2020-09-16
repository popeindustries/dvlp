'use strict';

const { cleanBundles } = require('../src/bundler/index.js');
const config = require('../src/config.js');
const EventSource = require('eventsource');
const { expect } = require('chai');
const fetch = require('node-fetch');
const http = require('http');
const path = require('path');
const serverFactory = require('../src/server/index.js');
const { Client: WebSocket } = require('faye-websocket');

let es, server, ws;

describe('server', () => {
  beforeEach(() => {
    cleanBundles();
  });
  afterEach(async () => {
    config.directories = [process.cwd()];
    cleanBundles();
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
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
      });
      const res = await fetch('http://localhost:8000/');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('<!doctype html>');
    });
    it('should rewrite request for missing html files to index.html ', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch('http://localhost:8000/0', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('<!doctype html>');
    });
    it('should serve a css file with correct mime type', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('text/css');
    });
    it('should serve a js file with correct mime type', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch('http://localhost:8000/script.js');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include(
        'application/javascript',
      );
    });
    it('should serve a js file with missing extension with correct mime type', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch('http://localhost:8000/script');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include(
        'application/javascript',
      );
    });
    it('should serve a js package file with correct mime type', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch('http://localhost:8000/nested');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include(
        'application/javascript',
      );
    });
    it('should serve a bundled module js file with correct mime type', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch(
        `http://localhost:8000/${config.bundleDirName}/lodash__array-4.17.10.js`,
      );
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include(
        'application/javascript',
      );
    });
    it('should serve a node_modules js file with correct mime type', async () => {
      server = await serverFactory('test/fixtures', { port: 8000 });
      const res = await fetch(`http://localhost:8000/foo/foo.js`);
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include(
        'application/javascript',
      );
      const body = await res.text();
      expect(body).to.contain("console.log('this is foo');");
    });
    it('should serve a font file with correct mime type', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch('http://localhost:8000/font.woff');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('font/woff');
    });
    it('should serve a json file with correct mime type', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch('http://localhost:8000/test.json');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/json');
    });
    it('should serve files from additional directories', async () => {
      server = await serverFactory(
        ['test/fixtures/www', path.resolve(__dirname, 'fixtures/assets')],
        { port: 8000 },
      );
      const res = await fetch('http://localhost:8000/index.css');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('text/css');
      expect(await res.text()).to.equal(
        'body {\n  background-color: white;\n}',
      );
    });
    it('should return 404 for missing file', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8000 });
      const res = await fetch('http://localhost:8000/not.css');
      expect(res.status).to.eql(404);
    });
    it('should start with custom Rollup config', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        rollupConfigPath: 'test/fixtures/rollup.config.js',
      });
      const res = await fetch(
        `http://localhost:8000/${config.bundleDirName}/debug-3.1.0.js`,
      );
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('/* this is a test */');
    });
    it('should inject the reload script into an html response', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: true,
      });
      const res = await fetch('http://localhost:8000/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('sse = new EventSource');
    });
    it('should throw on missing path', async () => {
      try {
        server = await serverFactory('www', { port: 8000, reload: false });
        expect(server).to.not.exist;
      } catch (err) {
        expect(err).to.exist;
      }
    });
    it('should transpile file content when using a transpiler', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
        transpilerPath: 'test/fixtures/transpiler.js',
      });
      const res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal(
        'this is transpiled content for: style.css',
      );
    });
    it('should transform file content when using an onTransform hook', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
        hooksPath: 'test/fixtures/hooks-transform.js',
      });
      const res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal(
        'this is transformed content for: style.css',
      );
    });
    it('should transform file content when using an onSend hook', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
        hooksPath: 'test/fixtures/hooks-send.js',
      });
      const res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal('this is sent content for: style.css');
    });
    it('should cache transpiled file content when using a transpiler', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
        transpilerPath: 'test/fixtures/transpiler.js',
      });
      let start = Date.now();
      let res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.above(200);
      start = Date.now();
      res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.below(10);
    });
    it('should cache transformed file content when using an onTransform hook', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
        hooksPath: 'test/fixtures/hooks-transform.js',
      });
      let start = Date.now();
      let res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.above(200);
      start = Date.now();
      res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.below(10);
    });
    it('should return error when transpiler error', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
        transpilerPath: 'test/fixtures/transpilerError.js',
      });
      const res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(500);
      expect(await res.text()).to.equal('transpiler error style.css');
    });
    it('should return error when hooks onTransform error', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
        hooksPath: 'test/fixtures/hooksError.js',
      });
      const res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(500);
      expect(await res.text()).to.equal('transform error style.css');
    });
    it('should respond to mocked requests', async () => {
      server = await serverFactory('test/fixtures/www', {
        mockPath: 'test/fixtures/mock/1234.json',
        port: 8000,
        reload: false,
      });
      const res = await fetch('http://localhost:8000/1234.jpg');
      expect(res.status).to.eql(200);
      expect(res.headers.get('content-type')).to.equal('image/jpeg');
    });
    it('should handle mock EventSource connection', (done) => {
      serverFactory('test/fixtures/www', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        es = new EventSource(
          'http://localhost:8000?dvlpmock=http%3A%2F%2Flocalhost%3A8888%2Ffeed',
        );
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          done();
        };
      });
    });
    it('should handle push mock event via EventSource', (done) => {
      serverFactory('test/fixtures/www', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        es = new EventSource(
          'http://localhost:8000?dvlpmock=http%3A%2F%2Flocalhost%3A8888%2Ffeed',
        );
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          fetch('http://localhost:8000/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stream: 'http://localhost:8888/feed',
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
      serverFactory('test/fixtures/www', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket(
          'ws://localhost:8000?dvlpmock=ws%3A%2F%2Flocalhost%3A8888%2Fsocket',
        );
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          done();
        });
      });
    });
    it('should handle push mock event via WebSocket', (done) => {
      serverFactory('test/fixtures/www', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket(
          'ws://localhost:8000?dvlpmock=ws%3A%2F%2Flocalhost%3A8888%2Fsocket',
        );
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          fetch('http://localhost:8000/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stream: 'ws://localhost:8888/socket',
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
    it('should start an app server', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: false,
      });
      const res = await fetch('http://localhost:8000/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    it('should start a function server', async () => {
      server = await serverFactory(
        () => {
          http
            .createServer((req, res) => {
              res.writeHead(200);
              res.end('hi');
            })
            .listen(8000);
        },
        { port: 8000, reload: false },
      );
      const res = await fetch('http://localhost:8000/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    it('should start an app server with additional directories', async () => {
      server = await serverFactory(
        ['test/fixtures/www', 'test/fixtures/app.js'],
        {
          port: 8000,
          reload: false,
        },
      );
      const res = await fetch('http://localhost:8000/module.js', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('main');
    });
    it('should start an app server listening for "request" event', async () => {
      server = await serverFactory('test/fixtures/appListener.js', {
        port: 8000,
      });
      const res = await fetch('http://localhost:8000/', {
        headers: { Accept: 'text/html; charset=utf-8' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('ok');
    });
    it('should start an esm app server', async () => {
      server = await serverFactory('test/fixtures/appEsm.js', { port: 8000 });
      const res = await fetch('http://localhost:8000/', {
        headers: { Accept: 'text/html; charset=utf-8' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    it('should polyfill process.env', async () => {
      server = await serverFactory('test/fixtures/appEsm.js', { port: 8000 });
      const res = await fetch('http://localhost:8000/', {
        headers: { Accept: 'text/html; charset=utf-8' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain(
        '<script>window.process=window.process||{env:{}};window.process.env.NODE_ENV="dvlptest";\nwindow.DVLP=true;</script>',
      );
    });
    it('should trigger exit handlers for clean up', async () => {
      server = await serverFactory('test/fixtures/appExit.js', { port: 8000 });
      expect(global.context.beforeExitCalled).to.equal(undefined);
      await server.restart();
      expect(global.context.beforeExitCalled).to.equal(true);
    });
    it('should trigger exit handlers for clean up', async () => {
      server = await serverFactory('test/fixtures/appGlobals.js', {
        port: 8000,
      });
      expect(global.foo).to.equal('foo');
      await server.destroy();
      expect(global.foo).to.equal(undefined);
    });
    it('should serve a bundled module js file', async () => {
      server = await serverFactory('test/fixtures/app.js', { port: 8000 });
      const res = await fetch(
        `http://localhost:8000/${config.bundleDirName}/lodash__array-4.17.20.js`,
      );
      expect(res.status).to.eql(200);
      const body = await res.text();
      expect(body).to.contain('function baseSlice');
      expect(body).to.contain('export default array;');
    });
    it('should serve a bundled module js file from server listening for "request" event', async () => {
      server = await serverFactory('test/fixtures/appListener.js', {
        port: 8000,
      });
      const res = await fetch(
        `http://localhost:8000/${config.bundleDirName}/lodash__array-4.17.20.js`,
      );
      expect(res.status).to.eql(200);
      const body = await res.text();
      expect(body).to.contain('function baseSlice');
      expect(body).to.contain('export default array;');
    });
    it('should serve a node_modules module js file', async () => {
      server = await serverFactory('test/fixtures/app.js', { port: 8000 });
      const res = await fetch(`http://localhost:8000/node_modules/foo/foo.js`);
      expect(res.status).to.eql(200);
      const body = await res.text();
      expect(body).to.contain("console.log('this is foo')");
    });
    it('should start with custom Rollup config', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        rollupConfigPath: 'test/fixtures/rollup.config.js',
      });
      const res = await fetch(
        `http://localhost:8000/${config.bundleDirName}/debug-3.1.0.js`,
      );
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('/* this is a test */');
    });
    it('should inject the reload script into an html response', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: true,
      });
      const res = await fetch('http://localhost:8000/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('sse = new EventSource');
    });
    it('should start with initial error', async () => {
      server = await serverFactory('test/fixtures/appError.js', {
        port: 8000,
        reload: false,
      });
      const res = await fetch('http://localhost:8000/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(500);
    });
    it('should transpile file content when using a transpiler', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: false,
        transpilerPath: 'test/fixtures/transpiler.js',
      });
      const res = await fetch('http://localhost:8000/www/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal(
        'this is transpiled content for: style.css',
      );
    });
    it('should transpile file content when using a transpiler', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: false,
        hooksPath: 'test/fixtures/hooks-transform.js',
      });
      const res = await fetch('http://localhost:8000/www/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal(
        'this is transformed content for: style.css',
      );
    });
    it('should respond to mocked requests', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        mockPath: 'test/fixtures/mock/1234.json',
        port: 8000,
        reload: false,
      });
      const res = await fetch('http://localhost:8000/1234.jpg');
      expect(res.status).to.eql(200);
      expect(res.headers.get('content-type')).to.equal('image/jpeg');
    });
    it('should handle mock EventSource connection', (done) => {
      serverFactory('test/fixtures/app.js', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        es = new EventSource(
          'http://localhost:8000?dvlpmock=http%3A%2F%2Flocalhost%3A8888%2Ffeed',
        );
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          done();
        };
      });
    });
    it('should handle push mock event via EventSource', (done) => {
      serverFactory('test/fixtures/app.js', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        es = new EventSource(
          'http://localhost:8000?dvlpmock=http%3A%2F%2Flocalhost%3A8888%2Ffeed',
        );
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          fetch('http://localhost:8000/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stream: 'http://localhost:8888/feed',
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
      serverFactory('test/fixtures/app.js', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket(
          'ws://localhost:8000?dvlpmock=ws%3A%2F%2Flocalhost%3A8888%2Fsocket',
        );
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          done();
        });
      });
    });
    it('should handle push mock event via EventSource', (done) => {
      serverFactory('test/fixtures/app.js', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket(
          'ws://localhost:8000?dvlpmock=ws%3A%2F%2Flocalhost%3A8888%2Fsocket',
        );
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          fetch('http://localhost:8000/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stream: 'ws://localhost:8888/socket',
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

  if (!process.env.CI) {
    describe('ssl', () => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      describe('static', () => {
        it('should implicitly serve index.html over https', async () => {
          server = await serverFactory('test/fixtures/www', {
            certsPath: 'test/fixtures/certificates',
            port: 8000,
            reload: false,
          });
          const res = await fetch('https://localhost:443/');
          expect(res.status).to.eql(200);
          expect(await res.text()).to.contain('<!doctype html>');
        });
        it('should serve a js file with correct mime type over https', async () => {
          server = await serverFactory('test/fixtures/www', {
            certsPath: 'test/fixtures/certificates',
            port: 8000,
            reload: false,
          });
          const res = await fetch('https://localhost:443/script.js');
          expect(res.status).to.eql(200);
          expect(res.headers.get('Content-type')).to.include(
            'application/javascript',
          );
        });
      });
      describe('application', () => {
        it('should start an app server over https', async () => {
          server = await serverFactory('test/fixtures/app.js', {
            certsPath: 'test/fixtures/certificates',
            port: 8000,
            reload: false,
          });
          const res = await fetch('https://localhost:443/', {
            headers: { accept: 'text/html' },
          });
          expect(res.status).to.eql(200);
          expect(await res.text()).to.contain('hi');
        });
        it('should serve a node_modules module js file over https', async () => {
          server = await serverFactory('test/fixtures/app.js', {
            certsPath: 'test/fixtures/certificates',
            port: 8000,
            reload: false,
          });
          const res = await fetch(
            `https://localhost:443/node_modules/foo/foo.js`,
          );
          expect(res.status).to.eql(200);
          const body = await res.text();
          expect(body).to.contain("console.log('this is foo')");
        });
      });
    });
  }
});
