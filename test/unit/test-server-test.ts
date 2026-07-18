import { EventSource } from 'eventsource';
import { expect } from 'chai';
import { readBody, testServer } from '../../src/dvlp-test.ts';
import websocket from 'faye-websocket';

const { Client: WebSocket } = websocket;
let server;
let es, ws;

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
    const res = await fetch('http://localhost:8080/src/dvlp-test.ts');
    expect(res).to.exist;
    expect(await res.text()).to.contain('testServer');
  });
  it('should respond to requests for resources using specific "webroot"', async () => {
    server = await testServer({ webroot: 'src' });
    const res = await fetch('http://localhost:8080/test-server/index.ts');
    expect(res).to.exist;
    const module = await res.text();
    expect(module).to.contain('TestServer');
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
    server = await testServer({ autorespond: true });
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
      const code = (err.cause ?? err).code;
      expect(code === 'ECONNRESET' || code === 'UND_ERR_SOCKET').to.be.true;
    }
  });
  it('should respond with custon "max-age"', async () => {
    server = await testServer({ autorespond: true });
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
      expect(err.message).to.equal(
        'network connections disabled. Unable to request http://www.google.com/',
      );
    }
  });
  it('should reroute external request when network disabled and rerouting enabled', async () => {
    testServer.disableNetwork(true);
    server = await testServer();
    const res = await fetch('http://www.google.com/src/dvlp-test.ts');
    expect(res).to.exist;
    expect(await res.text()).to.contain('testServer');
    testServer.disableNetwork(false);
  });

  describe('mockResponse()', () => {
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
    it('should respect custom headers when responding to mocked file', async () => {
      server = await testServer();
      server.mockResponse('/foo', {
        headers: { 'X-foo': 'foo', 'Cache-Control': 'private, max-age=2' },
        body: './test/unit/fixtures/mock/test.json',
      });
      const response = await fetch('http://localhost:8080/foo');
      expect(response.headers.get('Cache-Control')).to.equal(
        'private, max-age=2',
      );
      expect(response.headers.get('X-Foo')).to.equal('foo');
    });
  });

  describe('loadMockFiles()', () => {
    it('should respond to mocked image request with custom headers', async () => {
      server = await testServer();
      await server.loadMockFiles('test/unit/fixtures/mock');
      const res = await fetch('http://localhost:8080/1234.jpg');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('image/jpeg');
      expect(res.headers.get('Cache-Control')).to.equal('public, max-age=60');
      expect(res.headers.get('x-foo')).to.equal('foo');
    });
    it('should respond to mocked external json request', async () => {
      server = await testServer();
      await server.loadMockFiles('test/unit/fixtures/mock');
      const res = await fetch('http://www.someapi.com/v1/5678');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(await res.json()).to.eql({ user: { name: 'Nancy', id: 5678 } });
    });
    it('should respond to mocked external https json request', async () => {
      server = await testServer();
      await server.loadMockFiles('test/unit/fixtures/mock');
      const res = await fetch('https://www.someapi.com/v1/9012');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(await res.json()).to.eql({ user: { name: 'Bob', id: 9012 } });
    });
    it('should respond to mocked request from dynamic js response', async () => {
      server = await testServer();
      await server.loadMockFiles('test/unit/fixtures/mock');
      const res = await fetch('https://www.someapi.com/v1/4567');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(await res.json()).to.eql({ user: { name: 'Gus', id: 4567 } });
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
    it('should register WebSocket onSend callback', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        server.mockPushEvents('ws://localhost:8080/socket', [], (data) => {
          expect(data).to.equal('hi');
          done();
        });
        ws = new WebSocket('ws://localhost:8080/socket');
        ws.send('hi');
      });
    });
    it('should push mock event via EventSource', (done) => {
      testServer({ port: 8111 }).then((srvr) => {
        server = srvr;
        server.loadMockFiles('test/unit/fixtures/mock-push');
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
        server.loadMockFiles('test/unit/fixtures/mock-push-connect');
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
        server.loadMockFiles('test/unit/fixtures/mock-push');
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
        server.loadMockFiles('test/unit/fixtures/mock-push-connect');
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
        const events = [];
        let last;
        server = srvr;
        server.loadMockFiles('test/unit/fixtures/mock-push');
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
        const events = [];
        let last;
        server = srvr;
        server.loadMockFiles('test/unit/fixtures/mock-push');
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

  describe('mockResponse() method matching', () => {
    it('should match mocks by method', async () => {
      server = await testServer({ autorespond: false, latency: 0 });
      server.mockResponse(
        { url: '/api/thing', method: 'GET' },
        { body: { got: true } },
      );
      server.mockResponse(
        { url: '/api/thing', method: 'POST' },
        { body: { posted: true } },
      );
      const getRes = await fetch('http://localhost:8080/api/thing');
      const postRes = await fetch('http://localhost:8080/api/thing', {
        method: 'POST',
      });
      expect(await getRes.json()).to.eql({ got: true });
      expect(await postRes.json()).to.eql({ posted: true });
    });
    it('should prefer a method-specific mock over a method-less one', async () => {
      server = await testServer({ autorespond: false, latency: 0 });
      server.mockResponse(
        { url: '/api/thing', method: 'DELETE' },
        { body: { deleted: true } },
      );
      server.mockResponse('/api/thing', { body: { fallback: true } });
      const deleteRes = await fetch('http://localhost:8080/api/thing', {
        method: 'DELETE',
      });
      const getRes = await fetch('http://localhost:8080/api/thing');
      expect(await deleteRes.json()).to.eql({ deleted: true });
      expect(await getRes.json()).to.eql({ fallback: true });
    });
    it('should not match a request with a different method', async () => {
      server = await testServer({ autorespond: false, latency: 0 });
      server.mockResponse(
        { url: '/api/thing', method: 'POST' },
        { body: { posted: true } },
      );
      const res = await fetch('http://localhost:8080/api/thing');
      expect(res.status).to.equal(404);
    });
    it('should delay a mocked response', async () => {
      server = await testServer({ autorespond: false, latency: 0 });
      server.mockResponse('/api/slow', { body: { ok: true }, delay: 150 });
      const start = Date.now();
      const res = await fetch('http://localhost:8080/api/slow');
      expect(await res.json()).to.eql({ ok: true });
      expect(Date.now() - start).to.be.within(140, 400);
    });
  });

  describe('mockResponse() calls', () => {
    it('should record matched requests on the returned handle', async () => {
      server = await testServer({ autorespond: false, latency: 0 });
      const mocked = server.mockResponse('/api/user/:id', {
        body: { ok: true },
      });
      await fetch('http://localhost:8080/api/user/1234', {
        headers: { 'x-custom': 'yes' },
      });
      expect(mocked.calls).to.have.length(1);
      expect(mocked.calls[0].method).to.equal('GET');
      expect(mocked.calls[0].url).to.contain('/api/user/1234');
      expect(mocked.calls[0].headers['x-custom']).to.equal('yes');
      expect(mocked.calls[0].params).to.eql({ id: '1234' });
      expect(mocked.calls[0].body).to.equal(undefined);
    });
    it('should capture the request body', async () => {
      server = await testServer({ autorespond: false, latency: 0 });
      const mocked = server.mockResponse(
        { url: '/api/order', method: 'POST' },
        { body: { accepted: true } },
      );
      await fetch('http://localhost:8080/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'o-1', qty: 3 }),
      });
      await sleep(50);
      expect(mocked.calls).to.have.length(1);
      expect(JSON.parse(mocked.calls[0].body)).to.eql({ id: 'o-1', qty: 3 });
    });
    it('should retain calls after a "once" mock is removed', async () => {
      server = await testServer({ autorespond: false, latency: 0 });
      const mocked = server.mockResponse(
        '/api/once',
        { body: { ok: true } },
        true,
      );
      await fetch('http://localhost:8080/api/once');
      expect(server.mocks.cache.size).to.equal(0);
      expect(mocked.calls).to.have.length(1);
    });
    it('should still remove the mock when the handle is called', async () => {
      server = await testServer({ autorespond: false, latency: 0 });
      const mocked = server.mockResponse('/api/tmp', { body: { ok: true } });
      expect(server.mocks.cache.size).to.equal(1);
      mocked();
      expect(server.mocks.cache.size).to.equal(0);
    });
    it('should share the body between readBody and calls capture', (done) => {
      testServer({ autorespond: false, latency: 0 }).then((srvr) => {
        server = srvr;
        const mocked = server.mockResponse(
          { url: '/api/echo', method: 'POST' },
          (req, res) => {
            readBody(req).then((body) => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(body);
            });
          },
        );
        fetch('http://localhost:8080/api/echo', {
          method: 'POST',
          body: JSON.stringify({ echo: 'me' }),
        })
          .then((res) => res.json())
          .then((body) => {
            expect(body).to.eql({ echo: 'me' });
            expect(JSON.parse(mocked.calls[0].body)).to.eql({ echo: 'me' });
            done();
          });
      });
    });
  });

  describe('mockStream()', () => {
    it('should expose connection handles with id and protocols', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        const stream = server.mockStream('ws://localhost:8080/socket', {
          onConnection(connection) {
            expect(stream.connections).to.have.length(1);
            expect(stream.connections[0]).to.equal(connection);
            expect(connection.id).to.be.a('string');
            expect(connection.type).to.equal('ws');
            expect(connection.protocols).to.eql([
              'nbim.bearer.authorization|token',
              'chat',
            ]);
            done();
          },
        });
        ws = new WebSocket('ws://localhost:8080/socket', [
          'nbim.bearer.authorization|token',
          'chat',
        ]);
      });
    });
    it('should create a new connection handle on reconnect', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        const stream = server.mockStream('ws://localhost:8080/socket');
        ws = new WebSocket('ws://localhost:8080/socket');
        ws.on('open', () => {
          const first = stream.connections[0];
          expect(first).to.exist;
          ws.close();
          ws = new WebSocket('ws://localhost:8080/socket');
          ws.on('open', async () => {
            await sleep(50);
            expect(stream.connections).to.have.length(1);
            expect(stream.connections[0]).to.not.equal(first);
            expect(stream.connections[0].id).to.not.equal(first.id);
            expect(first.closed).to.equal(true);
            done();
          });
        });
      });
    });
    it('should send to a single connection only', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        const stream = server.mockStream('ws://localhost:8080/socket');
        const received = [];
        ws = new WebSocket('ws://localhost:8080/socket');
        ws.on('open', () => {
          const ws2 = new WebSocket('ws://localhost:8080/socket');
          ws2.on('open', () => {
            stream.connections[1].send({ to: 'second' });
          });
          ws2.on('message', async (event) => {
            received.push(event.data);
            await sleep(100);
            expect(received).to.eql(['{"to":"second"}']);
            ws2.close();
            done();
          });
        });
        ws.on('message', (event) => {
          received.push(`first: ${event.data}`);
        });
      });
    });
    it('should support request/reply on the same connection', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        server.mockStream('ws://localhost:8080/socket', {
          onConnection(connection) {
            connection.on('message', (data) => {
              const msg = JSON.parse(String(data));
              if (msg.action === 'subscribe') {
                connection.send({
                  type: 'ack',
                  correlationId: msg.correlationId,
                });
              }
            });
          },
        });
        ws = new WebSocket('ws://localhost:8080/socket');
        ws.on('open', () => {
          ws.send(JSON.stringify({ action: 'subscribe', correlationId: '42' }));
        });
        ws.on('message', (event) => {
          expect(JSON.parse(event.data)).to.eql({
            type: 'ack',
            correlationId: '42',
          });
          done();
        });
      });
    });
    it('should close a connection with code and reason', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        const stream = server.mockStream('ws://localhost:8080/socket');
        ws = new WebSocket('ws://localhost:8080/socket');
        ws.on('open', () => {
          stream.connections[0].close(4000, 'not allowed');
        });
        ws.on('close', (event) => {
          expect(event.code).to.equal(4000);
          expect(event.reason).to.equal('not allowed');
          done();
        });
      });
    });
    it('should close a connection with a reserved code via driver bypass', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        const stream = server.mockStream('ws://localhost:8080/socket');
        ws = new WebSocket('ws://localhost:8080/socket');
        ws.on('open', () => {
          stream.connections[0].close(1011, 'server error');
        });
        ws.on('close', (event) => {
          expect(event.code).to.equal(1011);
          expect(event.reason).to.equal('server error');
          done();
        });
      });
    });
    it('should reject unauthorized WebSocket connections', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        const stream = server.mockStream('ws://localhost:8080/socket', {
          authorize: ({ protocols }) =>
            protocols.includes('nbim.bearer.authorization|valid'),
        });
        ws = new WebSocket('ws://localhost:8080/socket', [
          'nbim.bearer.authorization|invalid',
        ]);
        ws.on('close', () => {
          expect(stream.connections).to.have.length(0);
          done();
        });
      });
    });
    it('should reject unauthorized EventSource connections with 401', (done) => {
      testServer({ port: 8080 }).then(async (srvr) => {
        server = srvr;
        server.mockStream('http://localhost:8080/feed', {
          authorize: ({ headers }) => headers['x-auth'] === 'valid',
        });
        const res = await fetch('http://localhost:8080/feed', {
          headers: { accept: 'text/event-stream' },
        });
        expect(res.status).to.equal(401);
        done();
      });
    });
    it('should send ws ping frames on an interval', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        server.mockStream('ws://localhost:8080/socket', { ping: 50 });
        ws = new WebSocket('ws://localhost:8080/socket');
        ws._driver.on('ping', () => {
          done();
        });
      });
    });
    it('should expose EventSource connection handles and headers', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        const stream = server.mockStream('http://localhost:8080/feed');
        es = new EventSource('http://localhost:8080/feed');
        es.onopen = () => {
          expect(stream.connections).to.have.length(1);
          expect(stream.connections[0].type).to.equal('es');
          expect(stream.connections[0].headers.accept).to.include(
            'text/event-stream',
          );
          stream.connections[0].send('hello', { event: 'greeting' });
        };
        es.addEventListener('greeting', (event) => {
          expect(event.data).to.equal('hello');
          done();
        });
      });
    });
    it('should register onSend callback with query string via mockPushEvents', (done) => {
      testServer({ port: 8080 }).then((srvr) => {
        server = srvr;
        server.mockPushEvents(
          'ws://localhost:8080/socket?foo=bar',
          [],
          (data) => {
            expect(data).to.equal('hi');
            done();
          },
        );
        ws = new WebSocket('ws://localhost:8080/socket');
        ws.send('hi');
      });
    });
  });
});
