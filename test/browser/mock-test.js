import { testBrowser } from 'dvlp/test-browser';

var expect = window.chai.expect;

describe('Mock', function () {
  describe('AJAX', function () {
    it('should respond to mocked AJAX request', function (done) {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'foo' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/foo');
      xhr.send();
    });
    it('should respond to mocked AJAX request using event listeners', function (done) {
      const xhr = new XMLHttpRequest();
      xhr.addEventListener('load', function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'foo' });
        done();
      });
      xhr.open('GET', 'http://www.google.com/foo');
      xhr.send();
    });
    it('should respond to locally mocked AJAX request', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: { name: 'bar' } },
        true,
      );
      expect(window.dvlp.cache).to.have.length(4);
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        expect(window.dvlp.cache).to.have.length(3);
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should respond to locally mocked AJAX request with custom status', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: { name: 'bar' }, status: 403 },
        true,
      );
      expect(window.dvlp.cache).to.have.length(4);
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        expect(xhr.status).to.equal(403);
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        expect(window.dvlp.cache).to.have.length(3);
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should respond to locally mocked AJAX request with error status', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: {}, error: 500 },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        expect(xhr.status).to.equal(500);
        expect(xhr.response).to.eql('error');
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should not respond to locally mocked hung AJAX request', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: {}, hang: true },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        expect(xhr.status).to.not.exist;
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
      setTimeout(done, 200);
    });
    it('should disable/enable all network connections when using AJAX', function (done) {
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
    it('should trigger callback when handling mocked AJAX request', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/foo',
        undefined,
        true,
        done,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'foo' });
      };
      xhr.open('GET', 'http://www.google.com/foo');
      xhr.send();
    });
    it('should trigger callback when handling locally mocked AJAX request', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        { body: { name: 'bar' } },
        true,
        done,
      );
      expect(window.dvlp.cache).to.have.length(4);
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it('should respond to locally mocked function AJAX request', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        function (req, res) {
          res.writeHead(200);
          res.end({ name: 'bar' });
        },
        true,
      );
      expect(window.dvlp.cache).to.have.length(4);
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar');
      xhr.send();
    });
    it.skip('should respond to locally mocked function AJAX POST request, with request.body', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/bar',
        function (req, res) {
          expect(req.body).to.exist;
          res.writeHead(200);
          res.end({ name: 'bar' });
        },
        true,
      );
      expect(window.dvlp.cache).to.have.length(4);
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('POST', 'http://www.google.com/bar');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ name: 'bar' }));
    });
    it('should respond to locally mocked AJAX request with ignoreSearch=true', function (done) {
      testBrowser.mockResponse(
        { url: 'http://www.google.com/bar', ignoreSearch: true },
        { body: { name: 'bar' } },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar?foo=1');
      xhr.send();
    });
    it('should respond to locally mocked AJAX request with search', function (done) {
      testBrowser.mockResponse(
        'http://www.google.com/bar?foo=1',
        { body: { name: 'bar' } },
        true,
      );
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const json = JSON.parse(xhr.response);
        expect(json).to.eql({ name: 'bar' });
        done();
      };
      xhr.open('GET', 'http://www.google.com/bar?foo=1');
      xhr.send();
    });
  });

  if (typeof fetch !== 'undefined') {
    describe('Fetch', function () {
      it('should respond to mocked fetch request', function (done) {
        fetch('http://www.google.com/foo', {
          mode: 'cors',
        }).then(function (res) {
          res.json().then(function (json) {
            expect(json).to.eql({ name: 'foo' });
            done();
          });
        });
      });
      it('should respond to locally mocked fetch request', function (done) {
        var remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: { name: 'bar' } },
          false,
        );
        expect(window.dvlp.cache).to.have.length(4);
        fetch('http://www.google.com/bar', {
          mode: 'cors',
        }).then(function (res) {
          res.json().then(function (json) {
            expect(json).to.eql({ name: 'bar' });
            remove();
            expect(window.dvlp.cache).to.have.length(3);
            done();
          });
        });
      });
      it('should work with remote mocked fetch request with Request object', function (done) {
        fetch(new Request('http://www.google.com/', { mode: 'no-cors' })).then(
          function (res) {
            res.text().then(function (text) {
              expect(text).to.eql('');
              done();
            });
          },
        );
      });
      it('should respond to locally mocked fetch request with custom status', function (done) {
        var remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: { name: 'bar' }, status: 403 },
          false,
        );
        expect(window.dvlp.cache).to.have.length(4);
        fetch('http://www.google.com/bar', {
          mode: 'cors',
        }).then(function (res) {
          expect(res.status).to.equal(403);
          expect(res.ok).to.be.false;
          res.json().then(function (json) {
            expect(json).to.eql({ name: 'bar' });
            remove();
            expect(window.dvlp.cache).to.have.length(3);
            done();
          });
        });
      });
      it('should respond to locally mocked fetch request with error status', function (done) {
        testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: {}, error: true },
          true,
        );
        fetch('http://www.google.com/bar', {
          mode: 'cors',
        }).then(function (res) {
          expect(res.status).to.equal(500);
          expect(res.ok).to.be.false;
          res.text().then(function (text) {
            expect(text).to.equal('error');
            done();
          });
        });
      });
      it('should not respond to locally mocked hung fetch request', function (done) {
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
      it('should disable/enable all network connections when using fetch', function (done) {
        testBrowser.disableNetwork();
        try {
          fetch('http://www.apple.com');
        } catch (err) {
          expect(err.message).to.include('network connections disabled');
          done();
        }
        testBrowser.enableNetwork();
      });
      it('trigger callback when handling mocked fetch request', function (done) {
        var remove = testBrowser.mockResponse(
          'http://www.google.com/foo',
          undefined,
          false,
          done,
        );
        expect(window.dvlp.cache).to.have.length(4);
        fetch('http://www.google.com/foo', {
          mode: 'cors',
        }).then(function (res) {
          res.json().then(function (json) {
            expect(json).to.eql({ name: 'foo' });
            remove();
            expect(window.dvlp.cache).to.have.length(3);
          });
        });
      });
      it('trigger callback when handling locally mocked fetch request', function (done) {
        var remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          { body: { name: 'bar' } },
          false,
          done,
        );
        expect(window.dvlp.cache).to.have.length(4);
        fetch('http://www.google.com/bar', {
          mode: 'cors',
        }).then(function (res) {
          res.json().then(function (json) {
            expect(json).to.eql({ name: 'bar' });
            remove();
            expect(window.dvlp.cache).to.have.length(3);
          });
        });
      });
      it('should respond to locally mocked function fetch request', function (done) {
        var remove = testBrowser.mockResponse(
          'http://www.google.com/bar',
          function (req, res) {
            res.writeHead(200);
            res.end(JSON.stringify({ name: 'bar' }));
          },
          false,
        );
        expect(window.dvlp.cache).to.have.length(4);
        fetch('http://www.google.com/bar', {
          mode: 'cors',
        }).then(function (res) {
          res.json().then(function (json) {
            expect(json).to.eql({ name: 'bar' });
            remove();
            expect(window.dvlp.cache).to.have.length(3);
            done();
          });
        });
      });
      it('should respond to locally mocked function fetch POST request, with request.body', function (done) {
        var remove = testBrowser.mockResponse(
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
        expect(window.dvlp.cache).to.have.length(4);
        var headers = new Headers({ 'content-type': 'application/json' });
        fetch('http://www.google.com/bar', {
          headers,
          method: 'POST',
          body: JSON.stringify({ name: 'bar' }),
          mode: 'cors',
        }).then(function (res) {
          res.json().then(function (json) {
            expect(json).to.eql({ name: 'bar' });
            remove();
            expect(window.dvlp.cache).to.have.length(3);
            done();
          });
        });
      });
    });
  }
  if (typeof EventSource !== 'undefined') {
    describe('EventSource', function () {
      it('should respond to mocked EventSource', function (done) {
        const es = new EventSource('http://someapi.com/feed');
        es.onopen = function () {
          expect(es.readyState).to.equal(1);
          es.close();
          done();
        };
      });
      it('should push mocked EventSource event', function (done) {
        const es = new EventSource('http://someapi.com/feed');
        es.onopen = function () {
          expect(es.readyState).to.equal(1);
          window.dvlp.pushEvent('http://someapi.com/feed', 'open');
        };
        es.addEventListener('foo', function (event) {
          expect(event.data).to.equal('{"title":"open"}');
          es.close();
          done();
        });
      });
      it('should disable/enable all network connections when using EventSource', function (done) {
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
    describe('WebSocket', function () {
      it('should respond to mocked WebSocket', function (done) {
        const ws = new WebSocket('ws://someapi.com/socket');
        ws.onopen = function () {
          expect(ws.readyState).to.equal(1);
          ws.close();
          done();
        };
      });
      it('should push mocked WebSocket event', function (done) {
        const ws = new WebSocket('ws://someapi.com/socket');
        ws.onopen = function () {
          expect(ws.readyState).to.equal(1);
          window.dvlp.pushEvent('ws://someapi.com/socket', 'foo event');
        };
        ws.onmessage = function (event) {
          expect(event.data).to.equal('{"title":"foo"}');
          ws.close();
          done();
        };
      });
      it('should disable/enable all network connections when using WebSocket', function (done) {
        testBrowser.disableNetwork();
        try {
          new WebSocket('http://someotherapi.com/feed');
        } catch (err) {
          expect(err.message).to.include('network connections disabled');
          done();
        }
        testBrowser.enableNetwork();
      });
    });
  }
});
