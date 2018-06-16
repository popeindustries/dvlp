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

  it('should create server with specific "port"', async () => {
    server = await testServer({ port: 3332 });
    expect(server).to.have.property('_port', 3332);
  });
  it('should respond to requests for resources using default "webroot"', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/index.js');
    expect(res).to.exist;
    expect(await res.text()).to.contain('testServer');
  });
  it('should respond to requests for resources using specific "webroot"', async () => {
    server = await testServer({ webroot: 'lib' });
    const res = await fetch('http://localhost:8080/testServer.js');
    expect(res).to.exist;
    expect(await res.text()).to.contain('DEFAULT_PORT');
  });
  it('should add default connection latency to each request', async () => {
    server = await testServer();
    const start = Date.now();
    const res = await fetch('http://localhost:8080/foo.js');
    expect(res).to.exist;
    expect(Date.now() - start).to.be.within(50, 150);
  });
  it('should add configured connection latency to each request', async () => {
    server = await testServer({ latency: 0 });
    const start = Date.now();
    const res = await fetch('http://localhost:8080/foo.js');
    expect(res).to.exist;
    expect(Date.now() - start).to.be.within(0, 50);
  });
  it('should respond to requests for fake resources', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/foo.js');
    expect(res).to.exist;
    expect(await res.text()).to.contain('hello');
  });
  it('should respond with 500 when "?error"', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/foo.js?error');
    expect(res).to.exist;
    expect(res.status).to.equal(500);
  });
  it('should respond with 404 when "?missing"', async () => {
    server = await testServer();
    const res = await fetch('http://localhost:8080/foo.js?missing');
    expect(res).to.exist;
    expect(res.status).to.equal(404);
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
    const res = await fetch('http://localhost:8080/foo.js?maxage=10');
    expect(res).to.exist;
    expect(res.headers.get('Cache-Control')).to.contain('max-age=10');
  });
  it('should respond to mocked json request', async () => {
    server = await testServer();
    server.mock('/api/foo', { body: { foo: 'foo' } });
    const res = await fetch('http://localhost:8080/api/foo');
    expect(res).to.exist;
    expect(await res.json()).to.eql({ foo: 'foo' });
    expect(res.headers.get('Content-type')).to.include('application/json');
    expect(server._mocks.size).to.equal(0);
  });
  it('should respond to malformed mocked json request', async () => {
    server = await testServer();
    server.mock('/api/foo', { foo: 'foo' });
    const res = await fetch('http://localhost:8080/api/foo');
    expect(res).to.exist;
    expect(await res.json()).to.eql({ foo: 'foo' });
    expect(res.headers.get('Content-type')).to.include('application/json');
    expect(server._mocks.size).to.equal(0);
  });
  it('should respond to mocked html request', async () => {
    server = await testServer();
    server.mock('/foo', { body: 'foo' });
    const res = await fetch('http://localhost:8080/foo');
    expect(res).to.exist;
    expect(await res.text()).to.eql('foo');
    expect(res.headers.get('Content-type')).to.include('text/html');
    expect(server._mocks.size).to.equal(0);
  });
  it('should respond to malformed mocked html request', async () => {
    server = await testServer();
    server.mock('/foo', 'foo');
    const res = await fetch('http://localhost:8080/foo');
    expect(res).to.exist;
    expect(await res.text()).to.eql('foo');
    expect(res.headers.get('Content-type')).to.include('text/html');
    expect(server._mocks.size).to.equal(0);
  });
});
