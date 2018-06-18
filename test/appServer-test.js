'use strict';

const { cleanCache, destroyWorkers } = require('../lib/utils/module');
const { CACHE_DIR_NAME } = require('../lib/utils/module');
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
    cleanCache();
    server && (await server.destroy());
  });
  after(async () => {
    changeBodyContent('hi');
    process.chdir(path.resolve(__dirname, '..'));
    await destroyWorkers();
  });

  it('should start an app server', async () => {
    server = await appServer('app.js', { port: 8000 });
    const res = await fetch('http://localhost:8000/', { headers: { accept: 'text/html' } });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('hi');
  });
  it.skip('should restart an app server on file change', (done) => {
    appServer('app.js', { port: 8000 }).then((s) => {
      server = s;
      changeBodyContent('bye');
    });
    setTimeout(async () => {
      const res = await fetch('http://localhost:8000/', { headers: { accept: 'text/html' } });
      expect(await res.text()).to.contain('bye');
      done();
    }, 500);
  });
  it('should serve a bundled module js file', async () => {
    server = await appServer('app.js', { port: 8000 });
    const res = await fetch(`http://localhost:8000/${CACHE_DIR_NAME}/lodash__array-4.17.10.js`, {
      headers: { referer: 'index.js' }
    });
    expect(res.status).to.eql(200);
    expect(await res.text()).to.contain('function baseSlice');
  });
});
