'use strict';

const { cleanBundles } = require('../lib/bundler/index.js');
const EventSource = require('eventsource');
const { expect } = require('chai');
const fetch = require('node-fetch');
const serverFactory = require('../lib/server/index.js');
const { Client: WebSocket } = require('faye-websocket');

let es, server, ws;

describe('server', () => {
  beforeEach(() => {
    cleanBundles();
  });
  afterEach(async () => {
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

  describe.only('static', () => {
    it('should start a file server', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false
      });
      const res = await fetch('http://localhost:8000/');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('<!doctype html>');
    });
    it('should inject the reload script into an html response', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: true
      });
      const res = await fetch('http://localhost:8000/');
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
        transpiler: 'test/fixtures/transpiler.js'
      });
      const res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal(
        'this is transpiled content for: style.css'
      );
    });
    it('should cache transpiled file content when using a transpiler', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8000,
        reload: false,
        transpiler: 'test/fixtures/transpiler.js'
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
        transpiler: 'test/fixtures/transpilerError.js'
      });
      const res = await fetch('http://localhost:8000/style.css');
      expect(res.status).to.eql(500);
      expect(await res.text()).to.equal('transpiler error style.css');
    });
    it('should respond to mocked requests', async () => {
      server = await serverFactory('test/fixtures/www', {
        mockPath: 'test/fixtures/mock/1234.json',
        port: 8000,
        reload: false
      });
      const res = await fetch('http://localhost:8000/1234.jpg');
      expect(res.status).to.eql(200);
      expect(res.headers.get('content-type')).to.equal('image/jpeg');
    });
    it('should handle mock EventSource connection', (done) => {
      serverFactory('test/fixtures/www', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false
      }).then((srvr) => {
        server = srvr;
        es = new EventSource(
          'http://localhost:8000?dvlpmock=http%3A%2F%2Flocalhost%3A8080%2Ffeed'
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
        reload: false
      }).then((srvr) => {
        server = srvr;
        es = new EventSource(
          'http://localhost:8000?dvlpmock=http%3A%2F%2Flocalhost%3A8080%2Ffeed'
        );
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          fetch('http://localhost:8000/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              stream: 'http://localhost:8080/feed',
              event: 'open'
            })
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
        reload: false
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket(
          'ws://localhost:8000?dvlpmock=ws%3A%2F%2Flocalhost%3A8888%2Fsocket'
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
        reload: false
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket(
          'ws://localhost:8000?dvlpmock=ws%3A%2F%2Flocalhost%3A8888%2Fsocket'
        );
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          fetch('http://localhost:8000/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              stream: 'ws://localhost:8888/socket',
              event: 'foo event'
            })
          });
        });
        ws.on('message', (event) => {
          expect(event.data).to.equal('{"title":"foo"}');
          done();
        });
      });
    });
  });

  describe('app', () => {
    it('should start a server', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: false
      });
      const res = await fetch('http://localhost:8000/', {
        headers: { accept: 'text/html' }
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    it('should inject the reload script into an html response', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: true
      });
      const res = await fetch('http://localhost:8000/', {
        headers: { accept: 'text/html' }
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('sse = new EventSource');
    });
    it('should start with initial error', async () => {
      server = await serverFactory('test/fixtures/appError.js', {
        port: 8000,
        reload: false
      });
      const res = await fetch('http://localhost:8000/', {
        headers: { accept: 'text/html' }
      });
      expect(res.status).to.eql(500);
    });
    it('should transpile file content when using a transpiler', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: false,
        transpiler: 'test/fixtures/transpiler.js'
      });
      const res = await fetch('http://localhost:8000/www/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal(
        'this is transpiled content for: style.css'
      );
    });
    it('should respond to mocked requests', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        mockPath: 'test/fixtures/mock/1234.json',
        port: 8000,
        reload: false
      });
      const res = await fetch('http://localhost:8000/1234.jpg');
      expect(res.status).to.eql(200);
      expect(res.headers.get('content-type')).to.equal('image/jpeg');
    });
    it('should handle mock EventSource connection', (done) => {
      serverFactory('test/fixtures/app.js', {
        mockPath: 'test/fixtures/mock-push',
        port: 8000,
        reload: false
      }).then((srvr) => {
        server = srvr;
        es = new EventSource(
          'http://localhost:8000?dvlpmock=http%3A%2F%2Flocalhost%3A8080%2Ffeed'
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
        reload: false
      }).then((srvr) => {
        server = srvr;
        es = new EventSource(
          'http://localhost:8000?dvlpmock=http%3A%2F%2Flocalhost%3A8080%2Ffeed'
        );
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          fetch('http://localhost:8000/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              stream: 'http://localhost:8080/feed',
              event: 'open'
            })
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
        reload: false
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket(
          'ws://localhost:8000?dvlpmock=ws%3A%2F%2Flocalhost%3A8888%2Fsocket'
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
        reload: false
      }).then((srvr) => {
        server = srvr;
        ws = new WebSocket(
          'ws://localhost:8000?dvlpmock=ws%3A%2F%2Flocalhost%3A8888%2Fsocket'
        );
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          fetch('http://localhost:8000/dvlp/push-event', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              stream: 'ws://localhost:8888/socket',
              event: 'foo event'
            })
          });
        });
        ws.on('message', (event) => {
          expect(event.data).to.equal('{"title":"foo"}');
          done();
        });
      });
    });
  });
});
