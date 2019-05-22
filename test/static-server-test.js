'use strict';

const { cleanBundles, destroyWorkers } = require('../lib/bundler/index.js');
const config = require('../lib/config.js');
const { expect } = require('chai');
const fetch = require('node-fetch');
const path = require('path');
const staticServer = require('../lib/server/static-server.js');

let server;

describe('staticServer', () => {
  before(() => {
    const cwd = path.resolve(__dirname, 'fixtures');
    config.directories.push(cwd, path.resolve(__dirname, 'fixtures/www'));
    process.chdir(cwd);
  });
  afterEach(async () => {
    cleanBundles();
    server && (await server.destroy());
  });
  after(async () => {
    config.directories.pop();
    config.directories.pop();
    process.chdir(path.resolve(__dirname, '..'));
    await destroyWorkers();
  });

  it('should implicitly serve index.html', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/');
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('<!doctype html>');
  });
  it('should rewrite request for missing html files to index.html ', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/0', {
      headers: { accept: 'text/html' }
    });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('<!doctype html>');
  });
  it('should serve a css file with correct mime type', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/style.css');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('text/css');
  });
  it('should serve a js file with correct mime type', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/script.js');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include(
      'application/javascript'
    );
  });
  it('should serve a js file with missing extension with correct mime type', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/script');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include(
      'application/javascript'
    );
  });
  it('should serve a js package file with correct mime type', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/nested');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include(
      'application/javascript'
    );
  });
  it('should serve a bundled module js file with correct mime type', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch(
      `http://localhost:8080/${config.bundleDirName}/lodash__array-4.17.10.js`
    );
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include(
      'application/javascript'
    );
  });
  it('should serve a node_modules module js file with correct mime type', async () => {
    server = await staticServer({ port: 8000 });
    const res = await fetch(`http://localhost:8000/node_modules/foo/foo.js`);
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include(
      'application/javascript'
    );
    const body = await res.text();
    expect(body).to.contain("console.log('this is foo');");
  });
  it('should serve a font file with correct mime type', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/font.woff');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('font/woff');
  });
  it('should serve a json file with correct mime type', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/test.json');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('application/json');
  });
  it('should serve files from additional directories', async () => {
    config.directories.push(path.resolve(__dirname, 'fixtures/assets'));
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/index.css');
    config.directories.pop();
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('text/css');
    expect(await res.text()).to.equal('body {\n  background-color: white;\n}');
  });
  it('should return 404 for missing file', async () => {
    server = await staticServer({ port: 8080 });
    const res = await fetch('http://localhost:8080/not.css');
    expect(res.status).to.eql(404);
  });
  it('should start with custom Rollup config', async () => {
    server = await staticServer({
      port: 8000,
      rollupConfig: require(path.resolve('rollup.config.js'))
    });
    const res = await fetch(
      `http://localhost:8000/${config.bundleDirName}/debug-3.1.0.js`
    );
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('/* this is a test */');
  });
});
