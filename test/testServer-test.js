'use strict';

const { expect } = require('chai');
const testServer = require('../lib/testServer');
const fetch = require('node-fetch');

let server;

describe('testServer', () => {
  afterEach(async () => {
    if (server) {
      await server.destroy();
    }
  });

  it('should create server with default "port"', async () => {
    server = await testServer();
    expect(server).to.have.property('destroy');
  });
  it('should create server with specific "port"', async () => {
    server = await testServer({ port: 3332 });
    expect(server.address()).to.have.property('port', 3332);
  });
  it('should respond to requests for resources using default "webroot"', async () => {
    server = await testServer();
    const response = await fetch('http://localhost:8080/index.js');
    expect(response).to.exist;
    expect(await response.text()).to.contain('testServer');
  });
  it('should respond to requests for resources using specific "webroot"', async () => {
    server = await testServer({ webroot: 'lib' });
    const response = await fetch('http://localhost:8080/testServer.js');
    expect(response).to.exist;
    expect(await response.text()).to.contain('DEFAULT_PORT');
  });
  it('should add default connection latency to each request', async () => {
    server = await testServer();
    const start = Date.now();
    const response = await fetch('http://localhost:8080/foo.js');
    expect(response).to.exist;
    expect(Date.now() - start).to.be.within(50, 150);
  });
  it('should add configured connection latency to each request', async () => {
    server = await testServer({ latency: 0 });
    const start = Date.now();
    const response = await fetch('http://localhost:8080/foo.js');
    expect(response).to.exist;
    expect(Date.now() - start).to.be.within(0, 50);
  });
  it('should respond to requests for fake resources', async () => {
    server = await testServer();
    const response = await fetch('http://localhost:8080/foo.js');
    expect(response).to.exist;
    expect(await response.text()).to.contain('hello');
  });
  it('should respond with 500 when "?error"', async () => {
    server = await testServer();
    const response = await fetch('http://localhost:8080/foo.js?error');
    expect(response).to.exist;
    expect(response.status).to.equal(500);
  });
  it('should respond with 404 when "?missing"', async () => {
    server = await testServer();
    const response = await fetch('http://localhost:8080/foo.js?missing');
    expect(response).to.exist;
    expect(response.status).to.equal(404);
  });
  it('should simulate offline when "?offline"', async () => {
    server = await testServer();
    try {
      await fetch('http://localhost:8080/foo.js?offline');
      expect(Error('should have errored'));
    } catch (err) {
      expect(err).to.have.property('code', 'ECONNRESET');
    }
  });
  it('should respond with custon "max-age"', async () => {
    server = await testServer();
    const response = await fetch('http://localhost:8080/foo.js?maxage=10');
    expect(response).to.exist;
    expect(response.headers.get('Cache-Control')).to.contain('max-age=10');
  });
});
