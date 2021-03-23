import EventSource from 'eventsource';
import { expect } from 'chai';
import fetch from 'node-fetch';
import testServer from '../src/test-server/index.js';
import websocket from 'faye-websocket';

const { Client: WebSocket } = websocket;
let es, server, ws;

function sleep(dur) {
  return new Promise((resolve) => {
    if (!dur) {
      return resolve();
    }
    setTimeout(resolve, dur);
  });
}

describe('testServer', () => {
  before(() => {
    testServer.disableNetwork();
  });
  afterEach(async () => {
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
  after(() => {
    testServer.enableNetwork();
  });

  it('should create server with specific "port"', async () => {
    server = await testServer({ port: 3332 });
    expect(server).to.have.property('port', 3332);
  });
  it('should respond to requests for resources using default "webroot"', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/src/index.js');
    expect(res).to.exist;
    expect(await res.text()).to.contain('testServer');
  });
  it('should respond to requests for resources using specific "webroot"', async () => {
    server = await testServer({ webroot: 'src' });
    const res = await fetch('http://localhost:8080/test-server/index.js');
    expect(res).to.exist;
    const module = await res.text();
    expect(module).to.contain('testServerFactory.disableNetwork');
  });
  it('should add default connection latency to each request', async () => {
    server = await testServer();
    const start = Date.now();
    const res = await fetch('http://localhost:8080/foo.js');
    expect(res).to.exist;
    expect(Date.now() - start).to.be.within(50, 150);
  });
  it('should add configured connection latency to each request', async () => {
    server = await testServer({ latency: 0 });
    const start = Date.now();
    const res = await fetch('http://localhost:8080/foo.js');
    expect(res).to.exist;
    expect(Date.now() - start).to.be.within(0, 50);
  });
  it('should respond to requests for fake resources', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/foo.js');
    expect(res).to.exist;
    expect(await res.text()).to.contain('hello');
  });
  it('should not respond to requests for fake resources when "autorespond=false"', async () => {
    server = await testServer({ autorespond: false });
    const res = await fetch('http://localhost:8080/foo.js');
    expect(res).to.exist;
    expect(res.status).to.equal(404);
  });
  it('should respond with 500 when "?error"', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/foo.js?error');
    expect(res).to.exist;
    expect(res.status).to.equal(500);
  });
  it('should respond with 404 when "?missing"', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/foo.js?missing');
    expect(res).to.exist;
    expect(res.status).to.equal(404);
  });
  it('should hang when "?hang"', async () => {
    let done = false;
    server = await testServer();
    fetch('http://localhost:8080/foo.js?hang')
      .then(() => {
        done = true;
      })
      .catch(() => {});
    await sleep(2000);
    expect(done).to.equal(false);
  });
  it('should simulate offline when "?offline"', async () => {
    server = await testServer();
    try {
      await fetch('http://localhost:8080/foo.js?offline');
      expect(Error('should have errored'));
    } catch (err) {
      expect(err).to.have.property('code', 'ECONNRESET');
    }
  });
  it('should respond with custon "max-age"', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/foo.js?maxage=10');
    expect(res).to.exist;
    expect(res.headers.get('Cache-Control')).to.contain('max-age=10');
  });
  it('should throw when making an external request and network disabled', async () => {
    try {
      const res = await fetch('http://www.google.com');
      expect(res).to.not.exist;
    } catch (err) {
      expect(err).to.exist;
      expect(err.message).to.equal('network connections disabled. Unable to request http://www.google.com/');
    }
  });
  it('should reroute external request when network disabled and rerouting enabled', async () => {
    testServer.disableNetwork(true);
    server = await testServer();
    const res = await fetch('http://www.google.com/src/index.js');
    expect(res).to.exist;
    expect(await res.text()).to.contain('testServer');
    testServer.disableNetwork(false);
  });

  describe('mock()', () => {
    it('should respond to mocked json request', async () => {
      server = await testServer();
      server.mockResponse('/api/foo', { body: { foo: 'foo' } });
      const res = await fetch('http://localhost:8080/api/foo');
      expect(res).to.exist;
      expect(await res.json()).to.eql({ foo: 'foo' });
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(server.mocks.cache.size).to.equal(1);
    });
    it('should respond to mocked json request only once', async () => {
      server = await testServer();
      server.mockResponse('/api/foo', { body: { foo: 'foo' } }, true);
      const res = await fetch('http://localhost:8080/api/foo');
      expect(res).to.exist;
      expect(await res.json()).to.eql({ foo: 'foo' });
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(server.mocks.cache.size).to.equal(0);
    });
    it('should respond to malformed mocked json request', async () => {
      server = await testServer();
      server.mockResponse('/api/foo', { foo: 'foo' }, true);
      const res = await fetch('http://localhost:8080/api/foo');
      expect(res).to.exist;
      expect(await res.json()).to.eql({ foo: 'foo' });
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(server.mocks.cache.size).to.equal(0);
    });
    it('should respond to mocked html request', async () => {
      server = await testServer();
      server.mockResponse('/foo', { body: '<p>foo</p>' }, true);
      const res = await fetch('http://localhost:8080/foo');
      expect(res).to.exist;
      expect(await res.text()).to.eql('<p>foo</p>');
      expect(res.headers.get('Content-type')).to.include('text/html');
      expect(server.mocks.cache.size).to.equal(0);
    });
    it('should respond to malformed mocked html request', async () => {
      server = await testServer();
      server.mockResponse('/foo', '<p>foo</p>', true);
      const res = await fetch('http://localhost:8080/foo');
      expect(res).to.exist;
      expect(await res.text()).to.eql('<p>foo</p>');
      expect(res.headers.get('Content-type')).to.include('text/html');
      expect(server.mocks.cache.size).to.equal(0);
    });
    it('should respond with mock error via default error response handler', async () => {
      server = await testServer();
      server.mockResponse('/foo', testServer.mockErrorResponseHandler, true);
      const res = await fetch('http://localhost:8080/foo');
      expect(res).to.exist;
      expect(res.status).to.equal(500);
    });
  });

  describe('loadMockFiles()', () => {
    it('should respond to mocked image request with custom headers', async () => {
      server = await testServer();
      server.loadMockFiles('test/fixtures/mock');
      const res = await fetch('http://localhost:8080/1234.jpg');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('image/jpeg');
      expect(res.headers.get('Cache-Control')).to.equal('public, max-age=10');
      expect(res.headers.get('x-foo')).to.equal('foo');
    });
    it('should respond to mocked external json request', async () => {
      server = await testServer();
      server.loadMockFiles('test/fixtures/mock');
      const res = await fetch('http://www.someapi.com/v1/5678');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(await res.json()).to.eql({ user: { name: 'Nancy', id: 5678 } });
    });
    it('should respond to mocked external https json request', async () => {
      server = await testServer();
      server.loadMockFiles('test/fixtures/mock');
      const res = await fetch('https://www.someapi.com/v1/9012');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(await res.json()).to.eql({ user: { name: 'Bob', id: 9012 } });
    });
  });

  describe('pushEvent()', () => {
    it('should push message via EventSource', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        es = new EventSource('http://localhost:8080');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          server.pushEvent('http://localhost:8080', { message: 'hi' });
        };
        es.onmessage = (event) => {
          expect(event.data).to.equal('hi');
          done();
        };
      });
    });
    it('should push event via EventSource', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        es = new EventSource('http://localhost:8080');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          server.pushEvent('http://localhost:8080', {
            message: 'hi',
            options: { event: 'hello' },
          });
        };
        es.addEventListener('hello', (event) => {
          expect(event.data).to.equal('hi');
          done();
        });
      });
    });
    it('should push message via WebSocket', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        ws = new WebSocket('ws://localhost:8080/socket');
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          server.pushEvent('ws://localhost:8080/socket', { message: 'hi' });
        });
        ws.on('message', (event) => {
          expect(event.data).to.equal('hi');
          done();
        });
      });
    });
    it('should push mock event via EventSource', (done) => {
      testServer({ port: 8111 }).then((srvr) => {
        server = srvr;
        server.loadMockFiles('test/fixtures/mock-push');
        es = new EventSource('http://localhost:8111/feed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          server.pushEvent('http://localhost:8111/feed', 'open');
        };
        es.addEventListener('foo', (event) => {
          expect(event.data).to.equal('{"title":"open"}');
          done();
        });
      });
    });
    it('should push mock connect event via EventSource', (done) => {
      testServer({ port: 8111 }).then((srvr) => {
        server = srvr;
        server.loadMockFiles('test/fixtures/mock-push-connect');
        es = new EventSource('http://localhost:8111/feed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
        };
        es.addEventListener('foo', (event) => {
          expect(event.data).to.equal('{"title":"foo"}');
        });
        es.addEventListener('bar', (event) => {
          expect(event.data).to.equal('{"title":"bar"}');
          done();
        });
      });
    });
    it('should push mock event via WebSocket', (done) => {
      testServer({ port: 8111 }).then((srvr) => {
        server = srvr;
        server.loadMockFiles('test/fixtures/mock-push');
        ws = new WebSocket('ws://localhost:8111/socket');
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
          server.pushEvent('ws://localhost:8111/socket', 'foo event');
        });
        ws.on('message', (event) => {
          expect(event.data).to.equal('{"title":"foo"}');
          done();
        });
      });
    });
    it('should push mock connect events via WebSocket', (done) => {
      testServer({ port: 8111 }).then((srvr) => {
        const events = [];
        server = srvr;
        server.loadMockFiles('test/fixtures/mock-push-connect');
        ws = new WebSocket('ws://localhost:8111/socket');
        ws.on('open', () => {
          expect(ws.readyState).to.equal(1);
        });
        ws.on('message', (event) => {
          events.push(event.data);
          if (events.length === 2) {
            expect(events).to.eql(['foo', 'bar']);
            done();
          }
        });
      });
    });
    it('should push a sequence of mock events via EventSource', (done) => {
      testServer({ port: 8111 }).then((srvr) => {
        let events = [];
        let last;
        server = srvr;
        server.loadMockFiles('test/fixtures/mock-push');
        es = new EventSource('http://localhost:8111/feed');
        es.onopen = () => {
          last = Date.now();
          expect(es.readyState).to.equal(1);
          server.pushEvent('http://localhost:8111/feed', 'bar events');
        };
        es.addEventListener('bar', (event) => {
          const now = Date.now();
          const elapsed = now - last;
          last = now;
          events.push(event.data);
          if (events.length === 1) {
            expect(elapsed).to.be.within(480, 550);
          } else if (events.length === 2) {
            expect(elapsed).to.be.within(980, 1050);
          } else if (events.length === 3) {
            expect(elapsed).to.be.within(0, 50);
            expect(events).to.eql(['bar1', 'bar2', 'bar3']);
            done();
          }
        });
      });
    });
    it('should push a sequence of mock events via WebSocket', (done) => {
      testServer({ port: 8111 }).then((srvr) => {
        let events = [];
        let last;
        server = srvr;
        server.loadMockFiles('test/fixtures/mock-push');
        ws = new WebSocket('ws://localhost:8111/socket');
        ws.on('open', () => {
          last = Date.now();
          expect(ws.readyState).to.equal(1);
          server.pushEvent('ws://localhost:8111/socket', 'bar events');
        });
        ws.on('message', (event) => {
          const now = Date.now();
          const elapsed = now - last;
          last = now;
          events.push(event.data);
          if (events.length === 1) {
            expect(elapsed).to.be.within(480, 550);
          } else if (events.length === 2) {
            expect(elapsed).to.be.within(980, 1050);
          } else if (events.length === 3) {
            expect(elapsed).to.be.within(0, 50);
            expect(events).to.eql(['bar1', 'bar2', 'bar3']);
            done();
          }
        });
      });
    });
  });
});
