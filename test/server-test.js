'use strict';

const { cleanCache } = require('../lib/utils/module');
const { expect } = require('chai');
const fetch = require('node-fetch');
const path = require('path');
const server = require('../lib/server');

let srv;

describe('server', () => {
  afterEach(async () => {
    cleanCache();
    srv && (await srv.destroy());
  });

  it('should start a static file server', async () => {
    srv = await server('test/fixtures/www', { port: 8080, reload: false });
    const res = await fetch('http://localhost:8080/', { headers: { accept: 'text/html' } });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('<!doctype html>');
  });
  it('should throw on missing path', async () => {
    try {
      srv = await server('www', { port: 8080, reload: false });
      expect(srv).to.not.exist;
    } catch (err) {
      expect(err).to.exist;
    }
  });
  it('should inject the reload script into a static server html response', async () => {
    srv = await server('test/fixtures/www', { port: 8080, reload: true });
    const res = await fetch('http://localhost:8080/', { headers: { accept: 'text/html' } });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('sse = new EventSource');
  });
  it('should start an app server', async () => {
    srv = await server('test/fixtures/app.js', { port: 8000, reload: false });
    const res = await fetch('http://localhost:8000/', { headers: { accept: 'text/html' } });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('hi');
  });
  it('should inject the reload script into an app server html response', async () => {
    srv = await server('test/fixtures/app.js', { port: 8000, reload: true });
    const res = await fetch('http://localhost:8000/', { headers: { accept: 'text/html' } });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('sse = new EventSource');
  });
  it('should start a static file server with custom Rollup config', async () => {
    srv = await server('test/fixtures/www', {
      port: 8080,
      reload: false,
      config: path.resolve(__dirname, './fixtures/www/rollup.config.js')
    });
    const res = await fetch('http://localhost:8080/.dvlp/debug-3.1.0.js');
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('/* this is a test */');
  });
  it('should start an app server with custom Rollup config', async () => {
    srv = await server('test/fixtures/app.js', {
      port: 8000,
      reload: false,
      config: path.resolve(__dirname, './fixtures/www/rollup.config.js')
    });
    const res = await fetch('http://localhost:8000/.dvlp/debug-3.1.0.js');
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('/* this is a test */');
  });
});
