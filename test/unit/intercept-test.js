import { expect } from 'chai';
import http from 'node:http';
import { interceptClientRequest } from '../../src/utils/intercept-client-request.js';
import { testServer } from '../../src/dvlp-test.js';

/** @type { () => void } */
let unintercept;
let server;

describe('intercept', () => {
  afterEach(async () => {
    unintercept?.();
  });

  describe('intercept-client-request', () => {
    beforeEach(async () => {
      server = await testServer({ autorespond: true, latency: 0 });
    });
    afterEach(async () => {
      server && (await server.destroy());
    });

    describe('fetch', () => {
      it('should intercept "fetch(string)"', (done) => {
        unintercept = interceptClientRequest((url) => {
          expect(url).to.have.property('href', 'http://localhost:8080/test');
          done();
        });
        fetch('http://localhost:8080/test');
      });
      it('should intercept "fetch(string)" with modification', async () => {
        unintercept = interceptClientRequest((url) => {
          url.searchParams.set('intercepted', 'true');
          return true;
        });
        const res = await fetch('http://localhost:8080/test');
        expect(await res.text()).to.equal(
          '"hello from http://localhost:8080/test?intercepted=true!"',
        );
      });
      it('should intercept "fetch(string, options)" with modification', async () => {
        unintercept = interceptClientRequest((url) => {
          url.searchParams.set('intercepted', 'true');
          return true;
        });
        const res = await fetch('http://localhost:8080/test', {
          headers: { 'x-test': 'true' },
        });
        expect(res.headers.get('x-test')).to.equal('true');
        expect(await res.text()).to.equal(
          '"hello from http://localhost:8080/test?intercepted=true!"',
        );
      });
      it('should intercept "fetch(request)"', (done) => {
        unintercept = interceptClientRequest((url) => {
          expect(url).to.have.property('href', 'http://localhost:8080/test');
          done();
        });
        fetch(new Request('http://localhost:8080/test'));
      });
      it('should intercept "fetch(request)" with modification', async () => {
        unintercept = interceptClientRequest((url) => {
          url.searchParams.set('intercepted', 'true');
          return true;
        });
        const res = await fetch(new Request('http://localhost:8080/test'));
        expect(await res.text()).to.equal(
          '"hello from http://localhost:8080/test?intercepted=true!"',
        );
      });
      it('should intercept "fetch(request, options)" with modification', async () => {
        unintercept = interceptClientRequest((url) => {
          url.searchParams.set('intercepted', 'true');
          return true;
        });
        const res = await fetch(
          new Request('http://localhost:8080/test', {
            headers: { 'x-test': 'true' },
          }),
        );
        expect(res.headers.get('x-test')).to.equal('true');
        expect(await res.text()).to.equal(
          '"hello from http://localhost:8080/test?intercepted=true!"',
        );
      });
    });

    describe('http.get', () => {
      it('should intercept "get(string)"', (done) => {
        unintercept = interceptClientRequest((url) => {
          expect(url).to.have.property('href', 'http://localhost:8080/test');
          done();
        });
        httpGetToPromise('http://localhost:8080/test');
      });
      it('should intercept "get(string)" with modification', async () => {
        unintercept = interceptClientRequest((url) => {
          url.searchParams.set('intercepted', 'true');
          return true;
        });
        const res = await httpGetToPromise('http://localhost:8080/test');
        expect(res).to.equal(
          '"hello from http://localhost:8080/test?intercepted=true!"',
        );
      });
      it('should intercept "get(options)" with modification', async () => {
        unintercept = interceptClientRequest((url) => {
          url.searchParams.set('intercepted', 'true');
          return true;
        });
        const res = await httpGetToPromise({
          href: 'http://localhost:8080/test',
        });
        expect(res).to.equal(
          '"hello from http://localhost:8080/test?intercepted=true!"',
        );
      });
    });
  });
});

function httpGetToPromise(...args) {
  return new Promise((resolve, reject) => {
    http
      .get(...args, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}
