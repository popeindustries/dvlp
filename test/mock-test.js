'use strict';

const { expect } = require('chai');
const { add, cache, cleanMocks, load, match, remove } = require('../lib/utils/mock');

function getRequest(url, headers = { accept: '*/*' }) {
  return {
    headers,
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    method: 'GET',
    url
  };
}

function getResponse() {
  return {
    headers: {},
    body: '',
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
  afterEach(cleanMocks);

  describe('add()', () => {
    it('should add a json type', () => {
      add('/data.json', { body: { data: 'foo' } });
      const mock = cache.get('localhost:8080/data.json');
      expect(mock).to.have.property('type', 'json');
    });
    it('should add a file type', () => {
      add('/image.jpeg', { body: 'image.jpeg' });
      const mock = cache.get('localhost:8080/image.jpeg');
      expect(mock).to.have.property('type', 'file');
    });
    it('should add an html type', () => {
      add('/index.html', { body: '<body>hi</body>' });
      const mock = cache.get('localhost:8080/index.html');
      expect(mock).to.have.property('type', 'html');
    });
    it('should handle incorrectly formatted response', () => {
      add('/data.json', { data: 'foo' });
      const mock = cache.get('localhost:8080/data.json');
      expect(mock.response.body).to.eql({ data: 'foo' });
    });
  });

  describe('remove()', () => {
    it('should remove an existing mock', () => {
      add('/data.json', { body: { data: 'foo' } });
      remove('/data.json');
      expect(cache.size).to.equal(0);
    });
  });

  describe('load()', () => {
    it('should load individual mock file', () => {
      load('test/fixtures/mock/1234.json');
      expect(cache.size).to.equal(1);
    });
    it('should load array of mock files', () => {
      load(['test/fixtures/mock/1234.json', 'test/fixtures/mock/5678.json']);
      expect(cache.size).to.equal(2);
    });
    it('should load a single file referencing multiple mocks', () => {
      load('test/fixtures/mock/multi.json');
      expect(cache.size).to.equal(2);
    });
    it('should load mock files from directory path', () => {
      load('test/fixtures/mock');
      expect(cache.size).to.equal(6);
    });
  });

  describe('match()', () => {
    beforeEach(() => {
      load('test/fixtures/mock');
    });

    it('should return "false" if no match', () => {
      expect(match(getRequest('http://www.someapi.com/v1/12'), {})).to.equal(false);
    });
    it('should return "false" if no match when not ignoring search', () => {
      expect(match(getRequest('/1234.jpg?u=bob'), {})).to.equal(false);
    });
    it('should respond to request for mock json', () => {
      const res = getResponse();
      match(getRequest('http://www.someapi.com/v1/5678'), res);
      expect(res.statusCode).to.equal(200);
      expect(res.body).to.equal('{"user":{"name":"Nancy","id":5678}}');
      expect(res.headers['Content-Type']).to.equal('application/json');
      expect(res.headers['x-custom']).to.equal('custom header');
    });
    it('should respond to request for mock image', (done) => {
      const res = getResponse();
      match(getRequest('/1234.jpg'), res);
      setTimeout(() => {
        expect(res.headers['Content-Type']).to.equal('image/jpeg');
        done();
      }, 50);
    });
  });
});
