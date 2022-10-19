import { expect } from 'chai';
import fetch from 'node-fetch';
import { testServer } from 'dvlp/test';

let server;

describe('testServer', () => {
  before(() => {
    testServer.disableNetwork();
  });
  afterEach(async () => {
    server && (await server.destroy());
  });
  after(() => {
    testServer.enableNetwork();
  });

  it('should respond to requests for fake resources', async () => {
    server = await testServer({ autorespond: true, port: 8888 });
    const res = await fetch('http://localhost:8888/foo.js');
    expect(res).to.exist;
    expect(await res.text()).to.contain('hello');
  });
  it('should respond with 404 when "?missing"', async () => {
    server = await testServer({ port: 8888 });
    const res = await fetch('http://localhost:8888/foo.js?missing');
    expect(res).to.exist;
    expect(res.status).to.equal(404);
  });
  it('should throw when making an external request and network disabled', async () => {
    try {
      const res = await fetch('http://www.google.com');
      expect(res).to.not.exist;
    } catch (err) {
      expect(err).to.exist;
      expect(err.message).to.equal(
        'network connections disabled. Unable to request http://www.google.com/',
      );
    }
  });
});
