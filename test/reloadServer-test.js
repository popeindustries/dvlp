'use strict';

const { client: WSClient } = require('websocket');
const { expect } = require('chai');
const fetch = require('node-fetch');
const reloadServer = require('../lib/reloadServer');

let server;

describe('reloadServer', () => {
  before(async () => {
    try {
      server = await reloadServer();
    } catch (err) {
      console.error(err);
    }
  });
  after(async () => {
    if (server) {
      await server.destroy();
    }
  });

  it('should allow only one active server at a time', async () => {
    const old = server;
    server = await reloadServer();
    expect(old).to.not.equal(server);
  });
  it('should serve the livereload.js file with correct mime type', async () => {
    const res = await fetch('http://localhost:35729/livereload.js');
    expect(res.status).to.eql(200);
    expect(res.headers.get('Content-type')).to.eql('text/javascript');
  });
  it('should return 404 for all other content', async () => {
    const res = await fetch('http://localhost:35729/nothing');
    expect(res.status).to.eql(404);
  });
  it('should open a socket connection', (done) => {
    const client = new WSClient();
    client.on('connect', () => {
      client.abort();
      done();
    });
    client.connect('ws://localhost:35729');
  });
  it('should broadcast a reload command');
});
