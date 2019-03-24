'use strict';

const { cleanBundles } = require('../lib/bundler/index.js');
const config = require('../lib/config.js');
const { expect } = require('chai');
const fetch = require('node-fetch');
const path = require('path');
const serverFactory = require('../lib/server/index.js');

let server;

describe('server', () => {
  beforeEach(() => {
    cleanBundles();
  });
  afterEach(async () => {
    cleanBundles();
    server && (await server.destroy());
  });

  describe('static', () => {
    it('should start a file server', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8080,
        reload: false
      });
      const res = await fetch('http://localhost:8080/');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('<!doctype html>');
    });
    it('should inject the reload script into an html response', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8080,
        reload: true
      });
      const res = await fetch('http://localhost:8080/');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('sse=new EventSource');
    });
    it.skip('should start a file server with custom Rollup config', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8080,
        reload: false,
        rollupConfig: path.resolve(__dirname, './fixtures/rollup.config.js')
      });
      const res = await fetch(
        `http://localhost:8080/${config.bundleDirName}/debug-3.1.0.js`
      );
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('/* this is a test */');
    });
    it('should throw on missing path', async () => {
      try {
        server = await serverFactory('www', { port: 8080, reload: false });
        expect(server).to.not.exist;
      } catch (err) {
        expect(err).to.exist;
      }
    });
    it('should transpile file content when using a transpiler', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8080,
        reload: false,
        transpiler: 'test/fixtures/transpiler.js'
      });
      const res = await fetch('http://localhost:8080/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal(
        'this is transpiled content for: style.css'
      );
    });
    it('should cache transpiled file content when using a transpiler', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8080,
        reload: false,
        transpiler: 'test/fixtures/transpiler.js'
      });
      let start = Date.now();
      let res = await fetch('http://localhost:8080/style.css');
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.above(200);
      start = Date.now();
      res = await fetch('http://localhost:8080/style.css');
      expect(res.status).to.eql(200);
      expect(Date.now() - start).to.be.below(10);
    });
    it('should return error when transpiler error', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8080,
        reload: false,
        transpiler: 'test/fixtures/transpilerError.js'
      });
      const res = await fetch('http://localhost:8080/style.css');
      expect(res.status).to.eql(500);
      expect(await res.text()).to.equal('transpiler error style.css');
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
      expect(await res.text()).to.contain('sse=new EventSource');
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
    it.skip('should start a server with custom Rollup config', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: false,
        rollupConfig: path.resolve(__dirname, './fixtures/rollup.config.js')
      });
      const res = await fetch(
        `http://localhost:8000/${config.bundleDirName}/debug-3.1.0.js`
      );
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('/* this is a test */');
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
        mockpath: 'test/fixtures/mock/1234.json',
        port: 8000,
        reload: false
      });
      const res = await fetch('http://localhost:8000/1234.jpg');
      expect(res.status).to.eql(200);
      expect(res.headers.get('content-type')).to.equal('image/jpeg');
    });
  });
});
