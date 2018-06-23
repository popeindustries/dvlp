'use strict';

const { expect } = require('chai');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { interceptClientRequest, interceptFileRead } = require('../lib/utils/intercept');
const path = require('path');

let called, restore;

describe('intercept', () => {
  beforeEach(() => {
    called = true;
  });
  afterEach(() => {
    called = false;
    restore && restore();
  });

  describe('interceptFileRead()', () => {
    it('should call passed function with filepath for fs.readFile', (done) => {
      restore = interceptFileRead((filepath) => {
        called = true;
        expect(filepath).to.equal(path.resolve('test/fixtures/app.js'));
      });
      fs.readFile(path.resolve('test/fixtures/app.js'), done);
      expect(called).to.equal(true);
    });
    it('should call passed function with filepath for fs.readFileSync', () => {
      restore = interceptFileRead((filepath) => {
        called = true;
        expect(filepath).to.equal(path.resolve('test/fixtures/app.js'));
      });
      fs.readFileSync(path.resolve('test/fixtures/app.js'));
      expect(called).to.equal(true);
    });
  });

  describe('interceptClientRequest()', () => {
    it('should call passed function with url instance for http.request', () => {
      restore = interceptClientRequest((url) => {
        called = true;
        expect(url).to.have.property('href', 'http://localhost:3000/foo');
        return false;
      });
      http.request('http://localhost:3000/foo');
      expect(called).to.equal(true);
    });
    it('should call passed function with url instance for http.get', () => {
      restore = interceptClientRequest((url) => {
        called = true;
        expect(url).to.have.property('href', 'http://localhost:3000/foo');
        return false;
      });
      http.get('http://localhost:3000/foo');
      expect(called).to.equal(true);
    });
    it('should call passed function with url instance for https.request', () => {
      restore = interceptClientRequest((url) => {
        called = true;
        expect(url).to.have.property('href', 'https://localhost:3000/foo');
        return false;
      });
      https.request('https://localhost:3000/foo');
      expect(called).to.equal(true);
    });
    it('should call passed function with url instance for https.get', () => {
      restore = interceptClientRequest((url) => {
        called = true;
        expect(url).to.have.property('href', 'https://localhost:3000/foo');
        return false;
      });
      https.get('https://localhost:3000/foo');
      expect(called).to.equal(true);
    });
    it('should call multiple passed functions', () => {
      let count = 0;
      restore = interceptClientRequest((url) => {
        called = true;
        expect(url).to.have.property('href', 'http://localhost:3000/foo');
        count++;
      });
      interceptClientRequest((url) => {
        called = true;
        count++;
        expect(url).to.have.property('href', 'http://localhost:3000/foo');
        expect(count).to.equal(2);
        return false;
      });
      http.request('http://localhost:3000/foo');
      expect(called).to.equal(true);
    });
  });
});
