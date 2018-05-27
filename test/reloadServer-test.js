'use strict';

const { client: WSClient } = require('websocket');
const { expect } = require('chai');
const fetch = require('node-fetch');
const reloadServer = require('../lib/reloadServer');

let server;

describe('reloadServer', () => {
  beforeEach(async () => {
    server = await reloadServer();
  });
  afterEach(async () => {
    if (server) {
      await server.destroy();
    }
  });

  it('should allow more than one instance', async () => {
    const server2 = await reloadServer();
    const res = await fetch(`http://localhost:${server.port}/livereload.js`);
    const res2 = await fetch(`http://localhost:${server2.port}/livereload.js`);
    expect(res.status).to.eql(200);
    expect(res2.status).to.eql(200);
    await server2.destroy();
  });
  it('should serve the livereload.js file with correct mime type', async () => {
    const res = await fetch(`http://localhost:${server.port}/livereload.js`);
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.eql('text/javascript');
  });
  it('should return 404 for all other content', async () => {
    const res = await fetch(`http://localhost:${server.port}/nothing`);
    expect(res.status).to.eql(404);
  });
  it('should open a socket connection', (done) => {
    const client = new WSClient();
    client.on('connect', () => {
      client.abort();
      done();
    });
    client.connect(`ws://localhost:${server.port}`);
  });
  it('should broadcast a reload command');
});
