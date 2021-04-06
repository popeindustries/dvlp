import { expect } from 'chai';
import fetch from 'node-fetch';
import { fork } from 'child_process';

/** @type { import('child_process').ChildProcess */
let childProcess;

describe('server', () => {
  afterEach(() => {
    childProcess && childProcess.kill();
  });

  describe('static', () => {
    it('should serve static files from single directory', async () => {
      childProcess = await child('bin/dvlp.js', ['test/integration/fixtures/assets']);
      const res = await fetch('http://localhost:8080/a.js');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/javascript');
    });
    it('should serve static files from multiple directories', async () => {
      childProcess = await child('bin/dvlp.js', ['test/integration/fixtures/assets', 'test/integration/fixtures/www']);
      let res = await fetch('http://localhost:8080/a.js');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('application/javascript');
      res = await fetch('http://localhost:8080/a.css');
      expect(res.status).to.eql(200);
      expect(res.headers.get('Content-type')).to.include('text/css');
    });
  });

  describe('application', () => {
    it('should start esm app server', async () => {
      childProcess = await child('bin/dvlp.js', ['test/integration/fixtures/app.mjs']);
      const res = await fetch('http://localhost:8080/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
    it('should start cjs app server', async () => {
      childProcess = await child('bin/dvlp.js', ['test/integration/fixtures/app.cjs']);
      const res = await fetch('http://localhost:8080/', {
        headers: { accept: 'text/html' },
      });
      expect(res.status).to.eql(200);
      expect(await res.text()).to.contain('hi');
    });
  });
});

function child(...args) {
  return new Promise((resolve, reject) => {
    const childProcess = fork(...args);
    setTimeout(() => {
      resolve(childProcess);
    }, 1000);
    childProcess.on('error', reject);
  });
}
