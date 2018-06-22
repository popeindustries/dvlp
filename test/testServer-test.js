'use strict';

const { expect } = require('chai');
const fetch = require('node-fetch');
const { cleanMocks } = require('../lib/utils/mock');
const testServer = require('../lib/testServer');

let server;

describe('testServer', () => {
  before(() => {
    testServer.disableNetwork();
  });
  afterEach(async () => {
    cleanMocks();
    if (server) {
      await server.destroy();
    }
  });
  after(() => {
    testServer.enableNetwork();
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
  it('should throw when making an external request', async () => {
    try {
      const res = await fetch('http://www.google.com');
      expect(res).to.not.exist;
    } catch (err) {
      expect(err).to.exist;
      expect(err.message).to.equal('network connections disabled');
    }
  });

  describe('mockOnce()', () => {
    it('should respond to mocked json request', async () => {
      server = await testServer();
      server.mockOnce('/api/foo', { body: { foo: 'foo' } });
      const res = await fetch('http://localhost:8080/api/foo');
      expect(res).to.exist;
      expect(await res.json()).to.eql({ foo: 'foo' });
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(server._singleShotMocks.size).to.equal(0);
    });
    it('should respond to malformed mocked json request', async () => {
      server = await testServer();
      server.mockOnce('/api/foo', { foo: 'foo' });
      const res = await fetch('http://localhost:8080/api/foo');
      expect(res).to.exist;
      expect(await res.json()).to.eql({ foo: 'foo' });
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(server._singleShotMocks.size).to.equal(0);
    });
    it('should respond to mocked html request', async () => {
      server = await testServer();
      server.mockOnce('/foo', { body: 'foo' });
      const res = await fetch('http://localhost:8080/foo');
      expect(res).to.exist;
      expect(await res.text()).to.eql('foo');
      expect(res.headers.get('Content-type')).to.include('text/html');
      expect(server._singleShotMocks.size).to.equal(0);
    });
    it('should respond to malformed mocked html request', async () => {
      server = await testServer();
      server.mockOnce('/foo', 'foo');
      const res = await fetch('http://localhost:8080/foo');
      expect(res).to.exist;
      expect(await res.text()).to.eql('foo');
      expect(res.headers.get('Content-type')).to.include('text/html');
      expect(server._singleShotMocks.size).to.equal(0);
    });
  });

  describe('mock()', () => {
    it('should respond to mocked image request', async () => {
      server = await testServer();
      server.mock('test/fixtures/mock');
      const res = await fetch('http://localhost:8080/1234.jpg');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('image/jpeg');
    });
    it('should respond to mocked external json request', async () => {
      server = await testServer();
      server.mock('test/fixtures/mock');
      const res = await fetch('http://www.someapi.com/v1/5678');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(await res.json()).to.eql({ user: { name: 'Nancy', id: 5678 } });
    });
    it('should respond to mocked external https json request', async () => {
      server = await testServer();
      server.mock('test/fixtures/mock');
      const res = await fetch('https://www.someapi.com/v1/9012');
      expect(res).to.exist;
      expect(res.headers.get('Content-type')).to.include('application/json');
      expect(await res.json()).to.eql({ user: { name: 'Bob', id: 9012 } });
    });
  });
});
