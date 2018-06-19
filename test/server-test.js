'use strict';

const { cleanBundles } = require('../lib/utils/bundler');
const { expect } = require('chai');
const fetch = require('node-fetch');
const { bundleDirName } = require('../lib/config');
const path = require('path');
const serverFactory = require('../lib/server');

let server;

describe('server', () => {
  beforeEach(cleanBundles);
  afterEach(async () => {
    cleanBundles();
    server && (await server.destroy());
  });

  describe('static', () => {
    it('should start a static file server', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8080, reload: false });
      const res = await fetch('http://localhost:8080/');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('<!doctype html>');
    });
    it('should inject the reload script into a static server html response', async () => {
      server = await serverFactory('test/fixtures/www', { port: 8080, reload: true });
      const res = await fetch('http://localhost:8080/');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('sse=new EventSource');
    });
    it('should start a static file server with custom Rollup config', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8080,
        reload: false,
        rollupConfig: path.resolve(__dirname, './fixtures/rollup.config.js')
      });
      const res = await fetch(`http://localhost:8080/${bundleDirName}/debug-3.1.0.js`);
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
    it('should transpile file content when using a transpiler with a static server', async () => {
      server = await serverFactory('test/fixtures/www', {
        port: 8080,
        reload: false,
        transpiler: 'test/fixtures/transpiler.js'
      });
      const res = await fetch('http://localhost:8080/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal('this is transpiled content for: style.css');
    });
    it('should cache transpiled file content when using a transpiler with a static server', async () => {
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
    it('should return error when transpiler error with a static server', async () => {
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
    it('should start an app server', async () => {
      server = await serverFactory('test/fixtures/app.js', { port: 8000, reload: false });
      const res = await fetch('http://localhost:8000/', { headers: { accept: 'text/html' } });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    it('should inject the reload script into an app server html response', async () => {
      server = await serverFactory('test/fixtures/app.js', { port: 8000, reload: true });
      const res = await fetch('http://localhost:8000/', { headers: { accept: 'text/html' } });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('sse=new EventSource');
    });
    it('should start an app server with initial error', async () => {
      server = await serverFactory('test/fixtures/appError.js', { port: 8000, reload: false });
      const res = await fetch('http://localhost:8000/', { headers: { accept: 'text/html' } });
      expect(res.status).to.eql(500);
    });
    it('should start an app server with custom Rollup config', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: false,
        rollupConfig: path.resolve(__dirname, './fixtures/rollup.config.js')
      });
      const res = await fetch(`http://localhost:8000/${bundleDirName}/debug-3.1.0.js`);
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('/* this is a test */');
    });
    it('should transpile file content when using a transpiler with an app server', async () => {
      server = await serverFactory('test/fixtures/app.js', {
        port: 8000,
        reload: false,
        transpiler: 'test/fixtures/transpiler.js'
      });
      const res = await fetch('http://localhost:8000/www/style.css');
      expect(res.status).to.eql(200);
      expect(await res.text()).to.equal('this is transpiled content for: style.css');
    });
  });
});
