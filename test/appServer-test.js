'use strict';

const { expect } = require('chai');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const appServer = require('../lib/appServer');

let server;

function changeBodyContent(content) {
  fs.writeFileSync(path.resolve('./body.js'), `module.exports = '${content}';\n`);
}

describe('appServer', () => {
  before(() => {
    process.chdir(path.resolve(__dirname, 'fixtures'));
  });
  afterEach(async () => {
    if (server) {
      await server.destroy();
    }
    changeBodyContent('hi');
  });
  after(() => {
    process.chdir(path.resolve(__dirname, '..'));
  });

  it.skip('should allow only one active server at a time', async () => {
    const old = await appServer('app.js', { port: 8000 });
    server = await appServer('app.js', { port: 8000 });
    expect(old).to.not.equal(server);
  });
  it('should start an app server', async () => {
    server = await appServer('app.js', { port: 8000 });
    const res = await fetch('http://localhost:8000/');
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('hi');
  });
  it('should restart an app server on file change', (done) => {
    appServer('app.js', { port: 8000 }, async () => {
      const res = await fetch('http://localhost:8000/');
      expect(await res.text()).to.contain('bye');
      done();
    }).then((s) => {
      server = s;
      changeBodyContent('bye');
    });
  });
});
