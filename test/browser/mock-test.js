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
      it('should work with remote mocked fetch request with Request object', async () => {
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
  }
});
