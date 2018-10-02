'use strict';

const { cleanBundles, destroyWorkers } = require('../lib/utils/bundler');
const appServer = require('../lib/appServer');
const { expect } = require('chai');
const fetch = require('node-fetch');
const fs = require('fs');
const { bundleDirName } = require('../lib/config');
const path = require('path');

let server;

function changeBodyContent(content) {
  fs.writeFileSync(path.resolve('./body.js'), `module.exports = '${content}';\n`);
}

describe('appServer', () => {
  before(() => {
    process.chdir(path.resolve(__dirname, 'fixtures'));
  });
  afterEach(async () => {
    cleanBundles();
    server && (await server.destroy());
  });
  after(async () => {
    changeBodyContent('hi');
    process.chdir(path.resolve(__dirname, '..'));
    await destroyWorkers();
  });

  it('should start an app server', async () => {
    server = await appServer('app.js', { port: 8000 });
    const res = await fetch('http://localhost:8000/', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('hi');
  });
  it.skip('should restart an app server on file change', (done) => {
    appServer('app.js', { port: 8000 }).then((s) => {
      server = s;
      changeBodyContent('bye');
    });
    setTimeout(async () => {
      const res = await fetch('http://localhost:8000/', {
        headers: { 'Content-Type': 'text/html' }
      });
      expect(await res.text()).to.contain('bye');
      done();
    }, 500);
  });
  it('should serve a bundled module js file', async () => {
    server = await appServer('app.js', { port: 8000 });
    const res = await fetch(`http://localhost:8000/${bundleDirName}/lodash__array-4.17.10.js`, {
      headers: { referer: 'index.js' }
    });
    expect(res.status).to.eql(200);
    const body = await res.text();
    expect(body).to.contain('function baseSlice');
    expect(body).to.contain('export default array;');
  });
  it('should pass requests through to app', async () => {
    server = await appServer('app.js', { port: 8000 });
    const res = await fetch(`http://localhost:8000/script.js`);
    expect(res.status).to.eql(200);
    expect(res.headers.get('x-app')).to.equal('test');
  });
});
