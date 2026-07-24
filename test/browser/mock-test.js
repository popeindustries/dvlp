import { expect } from 'chai';
import { testBrowser } from 'dvlp/test-browser';

describe('Mock', () => {
  describe('AJAX', () => {
    it('should respond to mocked AJAX request', (done) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'foo' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/foo');
      xhr.send();
    });
    it('should respond to mocked AJAX request using event listeners', (done) => {
      const xhr = new XMLHttpRequest();
      xhr.addEventListener('load', () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'foo' });
        done();
      });
      xhr.open('GET', 'http://www.google.com/foo');
      xhr.send();
    });
    it('should respond to locally mocked AJAX request', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: { name: 'bar' } },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should respond to locally mocked AJAX request with custom status', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: { name: 'bar' }, status: 403 },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        expect(xhr.status).to.equal(403);
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should respond to locally mocked AJAX request with error status', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: {}, error: 500 },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        expect(xhr.status).to.equal(500);
        expect(xhr.response).to.eql('error');
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should not respond to locally mocked hung AJAX request', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: {}, hang: true },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        expect(xhr.status).to.not.exist;
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
      setTimeout(done, 200);
    });
    it('should disable/enable all network connections when using AJAX', (done) => {
      testBrowser.disableNetwork();
      const xhr = new XMLHttpRequest();
      try {
        xhr.open('GET', 'http://www.apple.com');
      } catch (err) {
        expect(err.message).to.include('network connections disabled');
        done();
      }
      testBrowser.enableNetwork();
    });
    it('should trigger callback when handling mocked AJAX request', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/foo',
        undefined,
        true,
        done,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'foo' });
      };
      xhr.open('GET', 'http://www.google.com/foo');
      xhr.send();
    });
    it('should trigger callback when handling locally mocked AJAX request', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: { name: 'bar' } },
        true,
        done,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should respond to locally mocked function AJAX request', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        function (req, res) {
          res.writeHead(200);
          res.end({ name: 'bar' });
        },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it.skip('should respond to locally mocked function AJAX POST request, with request.body', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        function (req, res) {
          expect(req.body).to.exist;
          res.writeHead(200);
          res.end({ name: 'bar' });
        },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('POST', 'http://www.google.com/bar');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ name: 'bar' }));
    });
    it('should respond to locally mocked AJAX request with ignoreSearch=true', (done) => {
      testBrowser.mockResponse(
        { url: 'http://www.google.com/bar', ignoreSearch: true },
        { body: { name: 'bar' } },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar?foo=1');
      xhr.send();
    });
    it('should record matched AJAX requests on the returned mock handle', (done) => {
      const mocked = testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: { name: 'bar' } },
        true,
      );
      expect(mocked.calls).to.eql([]);
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        expect(mocked.calls).to.have.length(1);
        expect(mocked.calls[0]).to.have.property(
          'url',
          'http://www.google.com/bar',
        );
        expect(mocked.calls[0]).to.have.property('method', 'POST');
        expect(mocked.calls[0]).to.have.property('body', '{"name":"bar"}');
        expect(mocked.calls[0].headers).to.have.property(
          'content-type',
          'application/json',
        );
        done();
      };
      xhr.open('POST', 'http://www.google.com/bar');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ name: 'bar' }));
    });
    it('should delay locally mocked AJAX response', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: { name: 'bar' }, delay: 100 },
        true,
      );
      const start = Date.now();
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        expect(Date.now() - start).to.be.at.least(90);
        expect(JSON.parse(xhr.response)).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should respond to locally mocked AJAX request with search', (done) => {
      testBrowser.mockResponse(
        'http://www.google.com/bar?foo=1',
        { body: { name: 'bar' } },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar?foo=1');
      xhr.send();
    });
  });

  if (typeof fetch !== 'undefined') {
    describe('Fetch', () => {
      it('should respond to mocked fetch request', async () => {
        const res = await fetch('http://www.google.com/foo', {
          mode: 'cors',
        });
        const json = await res.json();
        expect(json).to.eql({ name: 'foo' });
      });
      it('should respond to locally mocked fetch request', async () => {
        const remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: { name: 'bar' } },
          false,
        );
        const res = await fetch('http://www.google.com/bar', {
          mode: 'cors',
        });
        const json = await res.json();
        expect(json).to.eql({ name: 'bar' });
        remove();
      });
      it('should work with remote mocked fetch request with Request object', async function () {
        // Unmocked url: performs a real (opaque) network request
        this.timeout(10000);
        const res = await fetch(
          new Request('http://www.google.com/', { mode: 'no-cors' }),
        );
        const text = await res.text();
        expect(text).to.eql('');
      });
      it('should respond to locally mocked fetch request with custom status', async () => {
        const remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: { name: 'bar' }, status: 403 },
          false,
        );
        const res = await fetch('http://www.google.com/bar', {
          mode: 'cors',
        });
        expect(res.status).to.equal(403);
        expect(res.ok).to.be.false;
        const json = await res.json();
        expect(json).to.eql({ name: 'bar' });
        remove();
      });
      it('should respond to locally mocked fetch request with error status', async () => {
        testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: {}, error: true },
          true,
        );
        const res = await fetch('http://www.google.com/bar', {
          mode: 'cors',
        });
        expect(res.status).to.equal(500);
        expect(res.ok).to.be.false;
        const text = await res.text();
        expect(text).to.equal('error');
      });
      it('should not respond to locally mocked hung fetch request', (done) => {
        testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: {}, hang: true },
          true,
        );
        fetch('http://www.google.com/bar', {
          mode: 'cors',
        }).then(function (res) {
          expect(res).to.not.exist;
        });
        setTimeout(done, 200);
      });
      it('should disable/enable all network connections when using fetch', (done) => {
        testBrowser.disableNetwork();
        try {
          fetch('http://www.apple.com');
        } catch (err) {
          expect(err.message).to.include('network connections disabled');
          done();
        }
        testBrowser.enableNetwork();
      });
      it('trigger callback when handling mocked fetch request', (done) => {
        const remove = testBrowser.mockResponse(
          'http://www.google.com/foo',
          undefined,
          false,
          done,
        );
        fetch('http://www.google.com/foo', {
          mode: 'cors',
        })
          .then((res) => res.json())
          .then((json) => {
            expect(json).to.eql({ name: 'foo' });
            remove();
          });
      });
      it('trigger callback when handling locally mocked fetch request', (done) => {
        const remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: { name: 'bar' } },
          false,
          done,
        );
        fetch('http://www.google.com/bar', {
          mode: 'cors',
        })
          .then((res) => res.json())
          .then((json) => {
            expect(json).to.eql({ name: 'bar' });
            remove();
          });
      });
      it('should respond to locally mocked function fetch request', async () => {
        const remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          (req, res) => {
            res.writeHead(200);
            res.end(JSON.stringify({ name: 'bar' }));
          },
          false,
        );
        const res = await fetch('http://www.google.com/bar', {
          mode: 'cors',
        });
        const json = await res.json();
        expect(json).to.eql({ name: 'bar' });
        remove();
      });
      it('should record matched fetch requests on the returned mock handle', async () => {
        const mocked = testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: { name: 'bar' } },
          false,
        );
        expect(mocked.calls).to.eql([]);
        await fetch('http://www.google.com/bar', {
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          body: JSON.stringify({ name: 'bar' }),
          mode: 'cors',
        });
        expect(mocked.calls).to.have.length(1);
        expect(mocked.calls[0]).to.have.property(
          'url',
          'http://www.google.com/bar',
        );
        expect(mocked.calls[0]).to.have.property('method', 'POST');
        expect(mocked.calls[0]).to.have.property('body', '{"name":"bar"}');
        expect(mocked.calls[0].headers).to.have.property(
          'content-type',
          'application/json',
        );
        mocked();
      });
      it('should delay locally mocked fetch response', async () => {
        const mocked = testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: { name: 'bar' }, delay: 100 },
          false,
        );
        const start = Date.now();
        const res = await fetch('http://www.google.com/bar', {
          mode: 'cors',
        });
        expect(Date.now() - start).to.be.at.least(90);
        expect(await res.json()).to.eql({ name: 'bar' });
        mocked();
      });
      it('should respond to locally mocked function fetch POST request, with request.body', async () => {
        const remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          function (req, res) {
            const json = JSON.parse(req.body);
            expect(req).to.have.property('method', 'POST');
            expect(json).to.eql({ name: 'bar' });
            res.writeHead(200);
            res.end(JSON.stringify(json));
          },
          false,
        );
        const headers = new Headers({ 'content-type': 'application/json' });
        const res = await fetch('http://www.google.com/bar', {
          headers,
          method: 'POST',
          body: JSON.stringify({ name: 'bar' }),
          mode: 'cors',
        });
        const json = await res.json();
        expect(json).to.eql({ name: 'bar' });
        remove();
      });
    });
  }
  if (typeof EventSource !== 'undefined') {
    describe('EventSource', () => {
      it('should respond to mocked EventSource', (done) => {
        const es = new EventSource('http://someapi.com/feed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          es.close();
          done();
        };
      });
      it('should push remote mocked EventSource event', (done) => {
        const es = new EventSource('http://someapi.com/feed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          window.dvlp.pushEvent('http://someapi.com/feed', 'open');
        };
        es.addEventListener('foo', (event) => {
          expect(event.data).to.equal('{"title":"open"}');
          es.close();
          done();
        });
      });
      it('should push locally registered mocked EventSource message', (done) => {
        const remove = testBrowser.mockPushEvents(
          'http://someotherapi.com/feed',
          { name: 'foo', message: 'hi' },
        );
        const es = new EventSource('http://someotherapi.com/feed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          window.dvlp.pushEvent('http://someotherapi.com/feed', 'foo');
        };
        es.onmessage = (event) => {
          expect(event.data).to.equal('hi');
          es.close();
          remove();
          done();
        };
      });
      it('should push locally registered mocked EventSource event', (done) => {
        const remove = testBrowser.mockPushEvents(
          'http://someotherapi.com/feed',
          { name: 'foo', message: 'hi', options: { event: 'foo' } },
        );
        const es = new EventSource('http://someotherapi.com/feed');
        es.onopen = () => {
          expect(es.readyState).to.equal(1);
          window.dvlp.pushEvent('http://someotherapi.com/feed', 'foo');
        };
        es.addEventListener('foo', (event) => {
          expect(event.data).to.equal('hi');
          es.close();
          remove();
          done();
        });
      });
      it('should disable/enable all network connections when using EventSource', (done) => {
        testBrowser.disableNetwork();
        try {
          new EventSource('http://someotherapi.com/feed');
        } catch (err) {
          expect(err.message).to.include('network connections disabled');
          done();
        }
        testBrowser.enableNetwork();
      });
    });
  }
  if (typeof WebSocket !== 'undefined') {
    describe('WebSocket', () => {
      it('should respond to mocked WebSocket', (done) => {
        const ws = new WebSocket('ws://someapi.com/socket');
        ws.onopen = () => {
          expect(ws.readyState).to.equal(1);
          ws.close();
          done();
        };
      });
      it('should push mocked WebSocket event', (done) => {
        const ws = new WebSocket('ws://someapi.com/socket');
        ws.onopen = () => {
          expect(ws.readyState).to.equal(1);
          window.dvlp.pushEvent('ws://someapi.com/socket', 'foo event');
        };
        ws.onmessage = (event) => {
          expect(event.data).to.equal('{"title":"foo"}');
          ws.close();
          done();
        };
      });
      it('should push locally registered mocked WebSocket message', (done) => {
        const remove = testBrowser.mockPushEvents(
          'ws://someotherapi.com/socket',
          { name: 'foo', message: 'hi' },
        );
        const ws = new WebSocket('ws://someotherapi.com/socket');
        ws.onopen = () => {
          expect(ws.readyState).to.equal(1);
          window.dvlp.pushEvent('ws://someotherapi.com/socket', 'foo');
        };
        ws.onmessage = (event) => {
          expect(event.data).to.equal('hi');
          ws.close();
          remove();
          done();
        };
      });
      it('should push locally registered mocked WebSocket message sequence', (done) => {
        const remove = testBrowser.mockPushEvents(
          'ws://someotherapi.com/socket',
          {
            name: 'foo events',
            sequence: [
              { message: '1', options: { delay: 50 } },
              { message: '2' },
            ],
          },
        );
        const events = [];
        const ws = new WebSocket('ws://someotherapi.com/socket');
        ws.onopen = () => {
          expect(ws.readyState).to.equal(1);
          window.dvlp.pushEvent('ws://someotherapi.com/socket', 'foo events');
        };
        ws.onmessage = (event) => {
          events.push(event.data);
          if (events.length === 2) {
            expect(events).to.eql(['1', '2']);
            ws.close();
            remove();
            done();
          }
        };
      });
      it('should disable/enable all network connections when using WebSocket', (done) => {
        testBrowser.disableNetwork();
        try {
          new WebSocket('ws://someotherapi.com/feed');
        } catch (err) {
          expect(err.message).to.include('network connections disabled');
          done();
        }
        testBrowser.enableNetwork();
      });
    });

    describe('mockStream', () => {
      it('should expose live WebSocket connections in connect order', (done) => {
        const connected = [];
        const stream = testBrowser.mockStream('ws://streamapi.com/socket', {
          onConnection: (connection) => connected.push(connection),
        });
        expect(stream.type).to.equal('ws');
        expect(stream.connections).to.eql([]);
        const ws = new WebSocket('ws://streamapi.com/socket');
        expect(stream.connections).to.have.length(1);
        expect(connected).to.have.length(1);
        expect(stream.connections[0].type).to.equal('ws');
        expect(stream.connections[0].closed).to.be.false;
        ws.onopen = () => {
          ws.close();
          stream.destroy();
          done();
        };
      });
      it('should observe messages sent by a WebSocket client', (done) => {
        const stream = testBrowser.mockStream('ws://streamapi.com/socket');
        const ws = new WebSocket('ws://streamapi.com/socket');
        stream.connections[0].on('message', (data) => {
          expect(data).to.equal('hi from client');
          ws.close();
          stream.destroy();
          done();
        });
        ws.onopen = () => {
          ws.send('hi from client');
        };
      });
      it('should send a message on a single WebSocket connection', (done) => {
        const stream = testBrowser.mockStream('ws://streamapi.com/socket');
        const ws = new WebSocket('ws://streamapi.com/socket');
        ws.onmessage = (event) => {
          expect(event.data).to.equal('hi from mock');
          ws.close();
          stream.destroy();
          done();
        };
        ws.onopen = () => {
          stream.connections[0].send('hi from mock');
        };
      });
      it('should broadcast a pushEvent to all EventSource connections', (done) => {
        const stream = testBrowser.mockStream('http://streamapi.com/feed');
        const received = [];
        const es1 = new EventSource('http://streamapi.com/feed');
        const es2 = new EventSource('http://streamapi.com/feed');
        const onMessage = (event) => {
          received.push(event.data);
          if (received.length === 2) {
            expect(received).to.eql(['all', 'all']);
            es1.close();
            es2.close();
            stream.destroy();
            done();
          }
        };
        es1.onmessage = onMessage;
        es2.onmessage = onMessage;
        expect(stream.connections).to.have.length(2);
        stream.pushEvent({ message: 'all', options: {} });
      });
      it('should remove closed connections', (done) => {
        const stream = testBrowser.mockStream('ws://streamapi.com/socket');
        const ws = new WebSocket('ws://streamapi.com/socket');
        const connection = stream.connections[0];
        connection.on('close', () => {
          expect(connection.closed).to.be.true;
          expect(stream.connections).to.eql([]);
          stream.destroy();
          done();
        });
        ws.onopen = () => {
          connection.close();
        };
      });
      it('should reject unauthorized connections with an error event', (done) => {
        const stream = testBrowser.mockStream('ws://streamapi.com/socket', {
          authorize: (context) => context.protocols.includes('authorized'),
        });
        const ws = new WebSocket('ws://streamapi.com/socket', 'unauthorized');
        expect(stream.connections).to.eql([]);
        ws.addEventListener('error', () => {
          stream.destroy();
          done();
        });
      });
    });
  }
});
