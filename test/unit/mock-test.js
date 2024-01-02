import { expect } from 'chai';
import { Mocks } from '../../src/mock/index.js';
import { pushEvent } from '../../src/push-events/index.js';

const mocks = new Mocks();

function getRequest(url, headers = { accept: '*/*' }) {
  return {
    headers,
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    method: 'GET',
    url,
    socket: {
      destroy() {
        this.destroyed = true;
      },
    },
  };
}
function getResponse() {
  return {
    headers: {},
    body: null,
    end(body) {
      this.body = body;
    },
    getHeader(name) {
      return this.headers[name];
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    metrics: {
      getEvent() {
        return 0;
      },
      recordEvent() {},
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = { ...this.headers, ...headers };
    },
    on() {},
    once() {},
    emit() {},
  };
}

describe('mock', () => {
  afterEach(mocks.clear);

  describe('addResponse()', () => {
    it('should add a json type', () => {
      const href = '/data.json';
      mocks.addResponse(href, { body: { data: 'foo' } });
      expect(mocks.cache.size).to.equal(1);
      const mock = Array.from(mocks.cache)[0];
      expect(mock.originRegex.test('http://localhost:8080')).to.be.true;
      expect(mock.pathRegex.test(href)).to.be.true;
    });
    it('should add a file type', () => {
      mocks.addResponse('/image.jpeg', { body: 'image.jpeg' });
      const mock = Array.from(mocks.cache)[0];
      expect(mock).to.have.property('type', 'file');
    });
    it('should add an html type', () => {
      mocks.addResponse('/index.html', { body: '<body>hi</body>' });
      const mock = Array.from(mocks.cache)[0];
      expect(mock).to.have.property('type', 'html');
    });
    it('should handle incorrectly formatted response', () => {
      mocks.addResponse('/data.json', { data: 'foo' });
      const mock = Array.from(mocks.cache)[0];
      expect(mock.response.body).to.eql({ data: 'foo' });
    });
    it('should handle search', () => {
      mocks.addResponse(
        { url: '/index.html?foo', ignoreSearch: true },
        { body: '<body>hi</body>' },
      );
      mocks.addResponse(
        { url: '/foo.html?foo', ignoreSearch: false },
        { body: '<body>hi</body>' },
      );
      const [mock1, mock2] = Array.from(mocks.cache);
      expect(mock1).to.have.property('ignoreSearch', true);
      expect(mock2).to.have.property('ignoreSearch', false);
      expect(mock1.pathRegex.test('/index.html/')).to.be.true;
      expect(mock1.pathRegex.test('/index.html')).to.be.true;
    });
    it('should handle 127.0.0.1 as localhost', () => {
      mocks.addResponse('http://127.0.0.1:8080/foo', { body: { data: 'bar' } });
      const mock = Array.from(mocks.cache)[0];
      expect(mock).to.have.property('type', 'json');
    });
    it('should return a remove function', () => {
      const href = '/data.json';
      const remove = mocks.addResponse(href, { body: { data: 'foo' } });
      expect(mocks.cache.size).to.equal(1);
      remove();
      expect(mocks.cache.size).to.equal(0);
    });
  });

  describe('addPushEvents()', () => {
    it('should add a single EventSource event', () => {
      mocks.addPushEvents('http://localhost:8080/foo', {
        name: 'foo',
        message: 'foo',
      });
      const mock = Array.from(mocks.cache)[0];
      expect(mock).to.have.property('type', 'es');
      expect(mock.originRegex.test('http://localhost:8080')).to.be.true;
      expect(mock.events).to.have.property('foo');
      expect(mock.events.foo[0]).to.have.property('message', 'foo');
    });
    it('should add a single WebSocket event', () => {
      mocks.addPushEvents('ws://localhost:8080/foo', {
        name: 'foo',
        message: 'foo',
      });
      const mock = Array.from(mocks.cache)[0];
      expect(mock).to.have.property('type', 'ws');
      expect(mock.originRegex.test('ws://localhost:8080')).to.be.true;
      expect(mock.events).to.have.property('foo');
      expect(mock.events.foo[0]).to.have.property('message', 'foo');
    });
    it('should add multiple EventSource events', () => {
      mocks.addPushEvents('http://localhost:8080/foo', [
        {
          name: 'foo',
          message: 'foo',
        },
        {
          name: 'bar',
          message: 'bar',
        },
      ]);
      const mock = Array.from(mocks.cache)[0];
      expect(mock).to.have.property('type', 'es');
      expect(mock.events).to.have.property('foo');
      expect(mock.events).to.have.property('bar');
    });
    it('should add multiple WebSocket events', () => {
      mocks.addPushEvents('ws://localhost:8080/foo', [
        {
          name: 'foo',
          message: 'foo',
        },
        {
          name: 'bar',
          message: 'bar',
        },
      ]);
      const mock = Array.from(mocks.cache)[0];
      expect(mock).to.have.property('type', 'ws');
      expect(mock.events).to.have.property('foo');
      expect(mock.events).to.have.property('bar');
    });
    it('should ignore events with no name', () => {
      mocks.addPushEvents('http://localhost:8080/foo', {
        message: 'foo',
      });
      const mock = Array.from(mocks.cache)[0];
      expect(mock.events).to.deep.equal({});
    });
  });

  describe('remove()', () => {
    it('should remove an existing mock', () => {
      mocks.addResponse('/data.json', { body: { data: 'foo' } });
      mocks.remove('/data.json');
      expect(mocks.cache.size).to.equal(0);
    });
    it('should remove an existing mock when query string', () => {
      mocks.addResponse('/index.html?foo', { body: '<body>hi</body>' });
      mocks.addResponse('/index.html?bar', { body: '<body>hi</body>' });
      mocks.remove('/index.html?foo');
      expect(mocks.cache.size).to.equal(1);
      mocks.remove('/index.html?bar');
      expect(mocks.cache.size).to.equal(0);
    });
    it('should remove an existing push event mock', () => {
      mocks.addPushEvents('http://localhost:8080/foo', {
        name: 'foo',
        message: 'foo',
      });
      mocks.remove('http://localhost:8080/foo');
      expect(mocks.cache.size).to.equal(0);
    });
  });

  describe('load()', () => {
    it('should load individual mock file', async () => {
      await mocks.load('test/unit/fixtures/mock/1234.json');
      expect(mocks.cache.size).to.equal(1);
    });
    it('should load array of mock files', async () => {
      await mocks.load([
        'test/unit/fixtures/mock/1234.json',
        'test/unit/fixtures/mock/5678.json',
      ]);
      expect(mocks.cache.size).to.equal(2);
    });
    it('should load a single file referencing multiple mocks', async () => {
      await mocks.load('test/unit/fixtures/mock/multi.json');
      expect(mocks.cache.size).to.equal(2);
    });
    it('should load mock files from directory path', async () => {
      await mocks.load('test/unit/fixtures/mock');
      expect(mocks.cache.size).to.equal(10);
    });
    it('should load mock files from directory path and update client string', async () => {
      await mocks.load('test/unit/fixtures/mock-push');
      expect(mocks.client).to.include(
        '"pathRegex": "^\\\\/feed[\\\\/#\\\\?]?$"',
      );
    });
    it('should prepare inlineable client string', async () => {
      await mocks.load('test/unit/fixtures/mock');
      expect(mocks.client).to.include(
        '"pathRegex": "^\\\\/1234\\\\.jpg[\\\\/#\\\\?]?$"',
      );
    });
  });

  describe('matchResponse()', () => {
    beforeEach(async () => {
      await mocks.load('test/unit/fixtures/mock');
    });

    it('should return "false" if no match', () => {
      const href = 'http://www.someapi.com/v1/12';
      expect(mocks.matchResponse(href, getRequest(href), {})).to.equal(false);
    });
    it('should return "false" if no match when not ignoring search', () => {
      const href = '/1234.jpg?u=bob';
      expect(mocks.matchResponse(href, getRequest(href), {})).to.equal(false);
    });
    it('should respond to request for mock json', () => {
      const href = 'http://www.someapi.com/v1/5678';
      const res = getResponse();
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.statusCode).to.equal(200);
      expect(res.body).to.equal('{"user":{"name":"Nancy","id":5678}}');
      expect(res.headers['Content-Type']).to.equal('application/json');
      expect(res.headers['x-custom']).to.equal('custom header');
      expect(res.headers['Date']).to.equal('Fri, 13 Oct 2020 23:59:59 GMT');
      expect(res.headers['Access-Control-Allow-Origin']).to.equal('*');
      expect(res.headers['Cache-Control']).to.equal('public, max-age=60');
    });
    it('should respond to request for mock json with search params', () => {
      const href = 'http://www.someapi.com/v1/search?foo=foo&bar=bar';
      const res = getResponse();
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.statusCode).to.equal(200);
      expect(res.headers['Content-Type']).to.equal('application/json');
    });
    it('should respond to request for mock json with out-of-order search params', () => {
      const href = 'http://www.someapi.com/v1/search?bar=bar&foo=foo';
      const res = getResponse();
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.statusCode).to.equal(200);
      expect(res.headers['Content-Type']).to.equal('application/json');
    });
    it('should respond to request for mock json when ignoring search params', () => {
      const href = 'http://www.someapi.com/v1/5678?bar=bar&foo=foo';
      const res = getResponse();
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.statusCode).to.equal(200);
      expect(res.headers['Content-Type']).to.equal('application/json');
    });
    it('should respond to request for mock json with parameters', () => {
      const href = 'http://www.someapi.com/v3/params/foo/bar?foo=foo&bar=bar';
      const res = getResponse();
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.statusCode).to.equal(200);
      expect(res.headers['Content-Type']).to.equal('application/json');
    });
    it('should respond to request for mock file', (done) => {
      const href = '/1234.jpg';
      const res = getResponse();
      mocks.matchResponse(href, getRequest(href), res);
      setTimeout(() => {
        expect(res.headers['Content-Type']).to.equal('image/jpeg');
        expect(res.headers['Cache-Control']).to.equal('public, max-age=60');
        expect(res.headers['x-foo']).to.equal('foo');
        done();
      }, 50);
    });
    it('should call onMock callback when response mocked', (done) => {
      const href = '/index.json';
      const res = getResponse();
      mocks.addResponse(href, { body: {} }, true, done);
      mocks.matchResponse(href, getRequest(href), res);
    });
    it('should respond to loopback request', (done) => {
      const href = 'http://127.0.0.1:8080/1234.jpg';
      const res = getResponse();
      mocks.matchResponse(href, getRequest(href), res);
      setTimeout(() => {
        expect(res.headers['Content-Type']).to.equal('image/jpeg');
        done();
      }, 50);
    });
    it('should invoke response handler', (done) => {
      const href = '/index.json';
      const res = getResponse();
      mocks.addResponse(href, (req, res) => {
        expect(new URL(req.url, 'http://localhost')).to.have.property(
          'pathname',
          href,
        );
        done();
      });
      mocks.matchResponse(href, getRequest(href), res);
    });
    it('should invoke response handler with parameters', (done) => {
      const href = 'http://www.someapi.com/v3/handler/foo/bar';
      const res = getResponse();
      mocks.addResponse(
        'http://www.someapi.com/v3/handler/:param1/:param2',
        (req, res) => {
          expect(req.params).to.deep.equal({ param1: 'foo', param2: 'bar' });
          done();
        },
      );
      mocks.matchResponse(href, getRequest(href), res);
    });
    it('should hang when "response.hang"', (done) => {
      const href = '/index.json';
      const res = getResponse();
      mocks.addResponse(href, { body: {}, hang: true });
      mocks.matchResponse(href, getRequest(href), res);
      setTimeout(() => {
        expect(res.statusCode).to.equal(undefined);
        expect(res.body).to.equal(null);
        done();
      }, 200);
    });
    it('should return 500 when "response.error"', () => {
      const href = '/index.json';
      const res = getResponse();
      mocks.addResponse(href, { body: {}, error: true });
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.statusCode).to.equal(500);
      expect(res.body).to.equal('error');
    });
    it('should return 404 when "response.missing"', () => {
      const href = '/index.json';
      const res = getResponse();
      mocks.addResponse(href, { body: {}, missing: true });
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.statusCode).to.equal(404);
      expect(res.body).to.equal('missing');
    });
    it('should destroy socket when "response.offline"', () => {
      const href = '/index.json';
      const req = getRequest(href);
      const res = getResponse();
      mocks.addResponse(href, { body: {}, offline: true });
      mocks.matchResponse(href, req, res);
      expect(res.statusCode).to.equal(undefined);
      expect(req.socket).to.have.property('destroyed', true);
    });
    it('should return custom status', () => {
      const href = '/index.json';
      const res = getResponse();
      mocks.addResponse(href, { body: {}, status: 403 });
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.statusCode).to.equal(403);
      expect(res.headers['Content-Type']).to.equal('application/json');
    });
    it('should return with custom cache-control header', () => {
      const href = '/index.json';
      const res = getResponse();
      mocks.addResponse(href, {
        body: {},
        headers: { 'Cache-Control': 'public, max-age=10' },
      });
      mocks.matchResponse(href, getRequest(href), res);
      expect(res.headers['Cache-Control']).to.equal('public, max-age=10');
    });
  });

  describe('matchPushEvent()', () => {
    beforeEach(() => {
      mocks.load('test/unit/fixtures/mock-push');
    });

    it('should return "false" if no match', () => {
      expect(
        mocks.matchPushEvent('https://localhost:8111/foo', 'open', pushEvent),
      ).to.equal(false);
      expect(
        mocks.matchPushEvent(
          'https://localhost:8111/feed',
          'opeeeen',
          pushEvent,
        ),
      ).to.equal(false);
    });
  });
});
