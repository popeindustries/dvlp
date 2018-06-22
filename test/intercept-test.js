'use strict';

const { expect } = require('chai');
const http = require('http');
const https = require('https');
const { interceptClientRequest } = require('../lib/utils/intercept');

describe('intercept', () => {
  before(() => {});
  afterEach(() => {});
  after(async () => {});

  describe('interceptClientRequest()', () => {
    it('should call passed function with url instance for http.request', (done) => {
      interceptClientRequest((url) => {
        expect(url).to.have.property('href', 'http://localhost:3000/foo');
        done();
      });
      http.request('http://localhost:3000/foo');
    });
    it('should call passed function with url instance for http.get', (done) => {
      interceptClientRequest((url) => {
        expect(url).to.have.property('href', 'http://localhost:3000/foo');
        done();
      });
      http.get('http://localhost:3000/foo');
    });
    it('should call passed function with url instance for https.request', (done) => {
      interceptClientRequest((url) => {
        expect(url).to.have.property('href', 'https://localhost:3000/foo');
        done();
      });
      https.request('https://localhost:3000/foo');
    });
    it('should call passed function with url instance for https.get', (done) => {
      interceptClientRequest((url) => {
        expect(url).to.have.property('href', 'https://localhost:3000/foo');
        done();
      });
      https.get('https://localhost:3000/foo');
    });
  });
});
