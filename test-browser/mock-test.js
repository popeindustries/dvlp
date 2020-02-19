var expect = window.chai.expect;

describe('Mock', function() {
  if (window.fetch) {
    it('should respond to mocked fetch request', function(done) {
      fetch('http://www.google.com/foo', {
        mode: 'cors'
      }).then(function(res) {
        res.json().then(function(json) {
          expect(json).to.eql({ name: 'foo' });
          done();
        });
      });
    });
  }
  it('should respond to mocked AJAX request', function(done) {
    const xhr = new XMLHttpRequest();
    xhr.onload = function() {
      const json = JSON.parse(xhr.response);
      expect(json).to.eql({ name: 'foo' });
      done();
    };
    xhr.open('GET', 'http://www.google.com/foo');
    xhr.send();
  });
  if (window.EventSource) {
    it('should respond to mocked EventSource', function(done) {
      const es = new EventSource('http://someapi.com/feed');
      es.onopen = function() {
        expect(es.readyState).to.equal(1);
        es.close();
        done();
      };
    });
    it('should push mocked EventSource event', function(done) {
      const es = new EventSource('http://someapi.com/feed');
      es.onopen = function() {
        expect(es.readyState).to.equal(1);
        window.dvlp.pushEvent('http://someapi.com/feed', 'open');
      };
      es.addEventListener('foo', function(event) {
        expect(event.data).to.equal('{"title":"open"}');
        es.close();
        done();
      });
    });
  }
  if (window.WebSocket) {
    it('should respond to mocked WebSocket', function(done) {
      const ws = new WebSocket('ws://someapi.com/socket');
      ws.onopen = function() {
        expect(ws.readyState).to.equal(1);
        ws.close();
        done();
      };
    });
    it('should push mocked WebSocket event', function(done) {
      const ws = new WebSocket('ws://someapi.com/socket');
      ws.onopen = function() {
        expect(ws.readyState).to.equal(1);
        window.dvlp.pushEvent('ws://someapi.com/socket', 'foo event');
      };
      ws.onmessage = function(event) {
        expect(event.data).to.equal('{"title":"foo"}');
        ws.close();
        done();
      };
    });
  }
});
