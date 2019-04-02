'use strict';

const { expect } = require('chai');
const Mock = require('../lib/mock/index.js');

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

  describe('add()', () => {
    it('should add a json type', () => {
      mocks.add('/data.json', { body: { data: 'foo' } });
      const mock = mocks.cache.get('localhost:8080/data.json');
      expect(mock).to.have.property('default');
      expect(mock.default).to.have.property('type', 'json');
    });
    it('should add a file type', () => {
      mocks.add('/image.jpeg', { body: 'image.jpeg' });
      const mock = mocks.cache.get('localhost:8080/image.jpeg');
      expect(mock.default).to.have.property('type', 'file');
    });
    it('should add an html type', () => {
      mocks.add('/index.html', { body: '<body>hi</body>' });
      const mock = mocks.cache.get('localhost:8080/index.html');
      expect(mock.default).to.have.property('type', 'html');
    });
    it('should handle incorrectly formatted response', () => {
      mocks.add('/data.json', { data: 'foo' });
      const mock = mocks.cache.get('localhost:8080/data.json');
      expect(mock.default.response.body).to.eql({ data: 'foo' });
    });
    it('should handle search', () => {
      mocks.add(
        { url: '/index.html?foo', ignoreSearch: true },
        { body: '<body>hi</body>' }
      );
      mocks.add(
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
      mocks.add('http://127.0.0.1:8080/foo', { body: { data: 'bar' } });
      const mock = mocks.cache.get('localhost:8080/foo');
      expect(mock).to.have.property('default');
      expect(mock.default).to.have.property('type', 'json');
    });
  });

  describe('remove()', () => {
    it('should remove an existing mock', () => {
      mocks.add('/data.json', { body: { data: 'foo' } });
      mocks.remove('/data.json');
      expect(mocks.cache.size).to.equal(0);
    });
    it('should remove an existing mock when query string', () => {
      mocks.add('/index.html?foo', { body: '<body>hi</body>' });
      mocks.add('/index.html?bar', { body: '<body>hi</body>' });
      mocks.remove('/index.html?foo');
      expect(mocks.cache.size).to.equal(1);
      mocks.remove('/index.html?bar');
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

  describe('match()', () => {
    beforeEach(() => {
      mocks.load('test/fixtures/mock');
    });

    it('should return "false" if no match', () => {
      expect(
        mocks.match(getRequest('http://www.someapi.com/v1/12'), {})
      ).to.equal(false);
    });
    it('should return "false" if no match when not ignoring search', () => {
      expect(mocks.match(getRequest('/1234.jpg?u=bob'), {})).to.equal(false);
    });
    it('should respond to request for mock json', () => {
      const res = getResponse();
      mocks.match(getRequest('http://www.someapi.com/v1/5678'), res);
      expect(res.statusCode).to.equal(200);
      expect(res.body).to.equal('{"user":{"name":"Nancy","id":5678}}');
      expect(res.headers['Content-Type']).to.equal('application/json');
      expect(res.headers['x-custom']).to.equal('custom header');
    });
    it('should respond to request for mock image', (done) => {
      const res = getResponse();
      mocks.match(getRequest('/1234.jpg'), res);
      setTimeout(() => {
        expect(res.headers['Content-Type']).to.equal('image/jpeg');
        done();
      }, 50);
    });
    it('should respond to loopback request', (done) => {
      const res = getResponse();
      mocks.match(getRequest('http://127.0.0.1:8080/1234.jpg'), res);
      setTimeout(() => {
        expect(res.headers['Content-Type']).to.equal('image/jpeg');
        done();
      }, 50);
    });
    it('should hang when "response.hang"', (done) => {
      const res = getResponse();
      mocks.add('/index.json', { body: {}, hang: true });
      mocks.match(getRequest('/index.json'), res);
      setTimeout(() => {
        expect(res.statusCode).to.equal(undefined);
        expect(res.body).to.equal(null);
        done();
      }, 200);
    });
    it('should return 500 when "response.error"', () => {
      const res = getResponse();
      mocks.add('/index.json', { body: {}, error: true });
      mocks.match(getRequest('/index.json'), res);
      expect(res.statusCode).to.equal(500);
      expect(res.body).to.equal('error');
    });
    it('should return 404 when "response.missing"', () => {
      const res = getResponse();
      mocks.add('/index.json', { body: {}, missing: true });
      mocks.match(getRequest('/index.json'), res);
      expect(res.statusCode).to.equal(404);
      expect(res.body).to.equal('missing');
    });
    it('should destroy socket when "response.offline"', () => {
      const req = getRequest('/index.json');
      const res = getResponse();
      mocks.add('/index.json', { body: {}, offline: true });
      mocks.match(req, res);
      expect(res.statusCode).to.equal(undefined);
      expect(req.socket).to.have.property('destroyed', true);
    });
  });
});
