'use strict';

const { expect } = require('chai');
const fetch = require('node-fetch');
const server = require('../lib/server');

let srv;

describe('server', () => {
  afterEach(async () => {
    if (srv) {
      try {
        await srv.destroy();
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
});
