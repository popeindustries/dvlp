'use strict';

const { expect } = require('chai');
const { cache, cleanMocks, load, match } = require('../lib/utils/mock');

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

  describe('load()', () => {
    it('should load mock files from directory path', async () => {
      load('test/fixtures/mock');
      expect(cache.size).to.equal(2);
    });
    it('should load individual mock file', async () => {
      load('test/fixtures/mock/1234.json');
      expect(cache.size).to.equal(1);
    });
    it('should load array of mock files', async () => {
      load(['test/fixtures/mock/1234.json', 'test/fixtures/mock/5678.json']);
      expect(cache.size).to.equal(2);
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
