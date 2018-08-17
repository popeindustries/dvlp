'use strict';

const { cleanBundles, destroyWorkers } = require('../lib/utils/bundler');
const { bundleDirName } = require('../lib/config');
const { expect } = require('chai');
const fetch = require('node-fetch');
const path = require('path');
const staticServer = require('../lib/staticServer');

let server;

describe('staticServer', () => {
  before(() => {
    process.chdir(path.resolve(__dirname, 'fixtures'));
  });
  afterEach(async () => {
    cleanBundles();
    server && (await server.destroy());
  });
  after(async () => {
    process.chdir(path.resolve(__dirname, '..'));
    await destroyWorkers();
  });

  it('should implicitly serve index.html', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/');
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('<!doctype html>');
  });
  it('should rewrite request for missing html files to index.html ', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/0', { headers: { accept: 'text/html' } });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('<!doctype html>');
  });
  it('should serve a css file with correct mime type', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/style.css');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('text/css');
  });
  it('should serve a js file with correct mime type', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/script.js');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('application/javascript');
  });
  it('should serve a js file with missing extension with correct mime type', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/script');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('application/javascript');
  });
  it('should serve a js package file with correct mime type', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/nested');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('application/javascript');
  });
  it('should serve a bundled module js file with correct mime type', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch(`http://localhost:8080/${bundleDirName}/lodash__array-4.17.10.js`);
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('application/javascript');
  });
  it('should serve a font file with correct mime type', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/font.woff');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('application/font-woff');
  });
  it('should serve a json file with correct mime type', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/test.json');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('application/json');
  });
  it('should serve files from additional directories', async () => {
    server = await staticServer(['www', 'assets'], { port: 8080 });
    const res = await fetch('http://localhost:8080/index.css');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.include('text/css');
    expect(await res.text()).to.equal('body {\n  background-color: white;\n}');
  });
  it('should return 404 for missing file', async () => {
    server = await staticServer('www', { port: 8080 });
    const res = await fetch('http://localhost:8080/not.css');
    expect(res.status).to.eql(404);
  });
});
