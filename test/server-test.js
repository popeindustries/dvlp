'use strict';

const { client: WSClient } = require('websocket');
const { expect } = require('chai');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const server = require('../lib/server');

function changeBodyContent(content) {
  fs.writeFileSync(path.resolve('test/fixtures/body.js'), `module.exports = '${content}';\n`);
}
let srv;

describe.only('server', () => {
  afterEach(async () => {
    if (srv) {
      try {
        await srv.destroy();
        changeBodyContent('hi');
      } catch (err) {
        console.log(err);
      }
    }
  });

  it('should start a static file server', async () => {
    srv = await server('test/fixtures/www', { port: 8080, reload: true });
    const res = await fetch('http://localhost:8080/');
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('<!doctype html>');
  });
  it('should start an app server', async () => {
    srv = await server('test/fixtures/app.js', { port: 8000, reload: true });
    const res = await fetch('http://localhost:8000/');
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('hi');
  });
  it.only('should reload browsers connected to static file server', async () => {
    return new Promise(async (resolve) => {
      const client = new WSClient();
      srv = await server('test/fixtures', { port: 8080, reload: true });
      client.on('message', (msg) => {
        console.log(msg);
        client.abort();
        resolve();
      });
      client.connect('ws://localhost:35729');
      changeBodyContent('bye');
    });
  });
});
