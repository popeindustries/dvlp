'use strict';

const { expect } = require('chai');
const fetch = require('node-fetch');
const path = require('path');
const staticServer = require('../lib/staticServer');

let server;

describe('staticServer', () => {
  before(() => {
    process.chdir(path.resolve(__dirname, 'fixtures'));
  });
  beforeEach(async () => {
    server = await staticServer('www', { port: 8080 });
  });
  afterEach(async () => {
    if (server) {
      await server.destroy();
    }
  });
  after(() => {
    process.chdir(path.resolve(__dirname, '..'));
  });

  it('should implicitly serve index.html', async () => {
    const res = await fetch('http://localhost:8080/');
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('<!doctype html>');
  });
  it('should serve a css file with correct mime type', async () => {
    const res = await fetch('http://localhost:8080/style.css');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.eql('text/css');
  });
  it('should serve a js file with correct mime type', async () => {
    const res = await fetch('http://localhost:8080/script.js');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.eql('application/javascript');
  });
  it('should serve a font file with correct mime type', async () => {
    const res = await fetch('http://localhost:8080/font.woff');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.eql('font/woff');
  });
  it('should serve a json file with correct mime type', async () => {
    const res = await fetch('http://localhost:8080/test.json');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.eql('application/json');
  });
  it('should serve files from additional directories', async () => {
    await server.destroy();
    server = await staticServer(['www', 'assets']);
    const res = await fetch('http://localhost:8080/index.css');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.eql('text/css');
    expect(await res.text()).to.equal('body {\n  background-color: white;\n}');
  });
  it('should return 404 for missing file', async () => {
    const res = await fetch('http://localhost:8080/not.css');
    expect(res.status).to.eql(404);
  });
  it.skip('should send custom headers', async () => {
    server.destroy();
    server = await staticServer('www', { headers: { 'X-Hello': 'World!' } });
    const res = await fetch('http://localhost:8080/');
    expect(res.status).to.eql(200);
    expect(res.headers.get('x-hello')).to.equal('World!');
  });
});
