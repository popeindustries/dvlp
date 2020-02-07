'use strict';

const { expect } = require('chai');
const Mock = require('../lib/mock/index.js');
const { pushEvent } = require('../lib/push-events/index.js');

const mocks = new Mock();

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
      }
    }
  };
}
function getResponse() {
  return {
    headers: {},
    body: null,
    end(body) {
      this.body = body;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      return this.headers[name];
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = { ...this.headers, ...headers };
    },
    on() {},
    once() {},
    emit() {}
  };
}

describe('mock', () => {
  afterEach(mocks.clean);

  describe('addResponse()', () => {
    it('should add a json type', () => {
      mocks.addResponse('/data.json', { body: { data: 'foo' } });
      const mock = mocks.cache.get('localhost:8080/data.json');
      expect(mock).to.have.property('default');
      expect(mock.default).to.have.property('type', 'json');
    });
    it('should add a file type', () => {
      mocks.addResponse('/image.jpeg', { body: 'image.jpeg' });
      const mock = mocks.cache.get('localhost:8080/image.jpeg');
      expect(mock.default).to.have.property('type', 'file');
    });
    it('should add an html type', () => {
      mocks.addResponse('/index.html', { body: '<body>hi</body>' });
      const mock = mocks.cache.get('localhost:8080/index.html');
      expect(mock.default).to.have.property('type', 'html');
    });
    it('should handle incorrectly formatted response', () => {
      mocks.addResponse('/data.json', { data: 'foo' });
      const mock = mocks.cache.get('localhost:8080/data.json');
      expect(mock.default.response.body).to.eql({ data: 'foo' });
    });
    it('should handle search', () => {
      mocks.addResponse(
        { url: '/index.html?foo', ignoreSearch: true },
        { body: '<body>hi</body>' }
      );
      mocks.addResponse(
        { url: '/foo.html?foo', ignoreSearch: false },
        { body: '<body>hi</body>' }
      );
      expect(mocks.cache.get('localhost:8080/index.html')).to.have.property(
        'default'
      );
      expect(mocks.cache.get('localhost:8080/foo.html')).to.have.property(
        '?foo'
      );
    });
    it('should handle 127.0.0.1 as localhost', () => {
      mocks.addResponse('http://127.0.0.1:8080/foo', { body: { data: 'bar' } });
      const mock = mocks.cache.get('localhost:8080/foo');
      expect(mock).to.have.property('default');
      expect(mock.default).to.have.property('type', 'json');
    });
  });

  describe('addPushEvents()', () => {
    it('should add a single EventSource event', () => {
      mocks.addPushEvents('http://localhost:8080/foo', {
        name: 'foo',
        message: 'foo'
      });
      const mock = mocks.cache.get('localhost:8080/foo');
      expect(mock).to.have.property('default');
      expect(mock.default).to.have.property('type', 'es');
      expect(mock.default.events).to.have.property('foo');
    });
    it('should add a single WebSocket event', () => {
      mocks.addPushEvents('ws://localhost:8080/foo', {
        name: 'foo',
        message: 'foo'
      });
      const mock = mocks.cache.get('localhost:8080/foo');
      expect(mock).to.have.property('default');
      expect(mock.default).to.have.property('type', 'ws');
      expect(mock.default.events).to.have.property('foo');
    });
    it('should add multiple EventSource events', () => {
      mocks.addPushEvents('http://localhost:8080/foo', [
        {
          name: 'foo',
          message: 'foo'
        },
        {
          name: 'bar',
          message: 'bar'
        }
      ]);
      const mock = mocks.cache.get('localhost:8080/foo');
      expect(mock.default.events).to.have.property('foo');
      expect(mock.default.events).to.have.property('bar');
    });
    it('should add multiple WebSocket events', () => {
      mocks.addPushEvents('ws://localhost:8080/foo', [
        {
          name: 'foo',
          message: 'foo'
        },
        {
          name: 'bar',
          message: 'bar'
        }
      ]);
      const mock = mocks.cache.get('localhost:8080/foo');
      expect(mock.default.events).to.have.property('foo');
      expect(mock.default.events).to.have.property('bar');
    });
    it('should ignore events with no name', () => {
      mocks.addPushEvents('http://localhost:8080/foo', {
        message: 'foo'
      });
      const mock = mocks.cache.get('localhost:8080/foo');
      expect(mock).to.have.property('default');
      expect(mock.default.events).to.not.have.property('foo');
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
        message: 'foo'
      });
      mocks.remove('http://localhost:8080/foo');
      expect(mocks.cache.size).to.equal(0);
    });
  });

  describe('load()', () => {
    it('should load individual mock file', () => {
      mocks.load('test/fixtures/mock/1234.json');
      expect(mocks.cache.size).to.equal(1);
    });
    it('should load array of mock files', () => {
      mocks.load([
        'test/fixtures/mock/1234.json',
        'test/fixtures/mock/5678.json'
      ]);
      expect(mocks.cache.size).to.equal(2);
    });
    it('should load a single file referencing multiple mocks', () => {
      mocks.load('test/fixtures/mock/multi.json');
      expect(mocks.cache.size).to.equal(2);
    });
    it('should load mock files from directory path', () => {
      mocks.load('test/fixtures/mock');
      expect(mocks.cache.size).to.equal(7);
    });
  });

  describe('matchResponse()', () => {
    beforeEach(() => {
      mocks.load('test/fixtures/mock');
    });

    it('should return "false" if no match', () => {
      expect(
        mocks.matchResponse(getRequest('http://www.someapi.com/v1/12'), {})
      ).to.equal(false);
    });
    it('should return "false" if no match when not ignoring search', () => {
      expect(mocks.matchResponse(getRequest('/1234.jpg?u=bob'), {})).to.equal(
        false
      );
    });
    it('should respond to request for mock json', () => {
      const res = getResponse();
      mocks.matchResponse(
        'http://www.someapi.com/v1/5678',
        getRequest('http://www.someapi.com/v1/5678'),
        res
      );
      expect(res.statusCode).to.equal(200);
      expect(res.body).to.equal('{"user":{"name":"Nancy","id":5678}}');
      expect(res.headers['Content-Type']).to.equal('application/json');
      expect(res.headers['x-custom']).to.equal('custom header');
    });
    it('should respond to request for mock image', (done) => {
      const res = getResponse();
      mocks.matchResponse('/1234.jpg', getRequest('/1234.jpg'), res);
      setTimeout(() => {
        expect(res.headers['Content-Type']).to.equal('image/jpeg');
        done();
      }, 50);
    });
    it('should call onMock callback when response mocked', (done) => {
      const res = getResponse();
      mocks.addResponse('/index.json', { body: {} }, true, done);
      mocks.matchResponse('/index.json', getRequest('/index.json'), res);
    });
    it('should respond to loopback request', (done) => {
      const res = getResponse();
      mocks.matchResponse(
        'http://127.0.0.1:8080/1234.jpg',
        getRequest('http://127.0.0.1:8080/1234.jpg'),
        res
      );
      setTimeout(() => {
        expect(res.headers['Content-Type']).to.equal('image/jpeg');
        done();
      }, 50);
    });
    it('should hang when "response.hang"', (done) => {
      const res = getResponse();
      mocks.addResponse('/index.json', { body: {}, hang: true });
      mocks.matchResponse('/index.json', getRequest('/index.json'), res);
      setTimeout(() => {
        expect(res.statusCode).to.equal(undefined);
        expect(res.body).to.equal(null);
        done();
      }, 200);
    });
    it('should return 500 when "response.error"', () => {
      const res = getResponse();
      mocks.addResponse('/index.json', { body: {}, error: true });
      mocks.matchResponse('/index.json', getRequest('/index.json'), res);
      expect(res.statusCode).to.equal(500);
      expect(res.body).to.equal('error');
    });
    it('should return 404 when "response.missing"', () => {
      const res = getResponse();
      mocks.addResponse('/index.json', { body: {}, missing: true });
      mocks.matchResponse('/index.json', getRequest('/index.json'), res);
      expect(res.statusCode).to.equal(404);
      expect(res.body).to.equal('missing');
    });
    it('should destroy socket when "response.offline"', () => {
      const req = getRequest('/index.json');
      const res = getResponse();
      mocks.addResponse('/index.json', { body: {}, offline: true });
      mocks.matchResponse('/index.json', req, res);
      expect(res.statusCode).to.equal(undefined);
      expect(req.socket).to.have.property('destroyed', true);
    });
  });

  describe('matchPushEvent()', () => {
    beforeEach(() => {
      mocks.load('test/fixtures/mock-push');
    });

    it('should return "false" if no match', () => {
      expect(
        mocks.matchPushEvent('https://localhost:8888/foo', 'open', pushEvent)
      ).to.equal(false);
      expect(
        mocks.matchPushEvent(
          'https://localhost:8888/feed',
          'opeeeen',
          pushEvent
        )
      ).to.equal(false);
    });
  });
});
