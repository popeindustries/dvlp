var expect = window.chai.expect;

describe('Mock', function() {
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
  it.only('should add a local json response', function(done) {
    var remove = window.dvlp.addResponse(
      'http://www.google.com/bar',
      { body: { name: 'bar' } },
      true
    );
    expect(window.dvlp.cache).to.have.length(4);
    const xhr = new XMLHttpRequest();
    xhr.onload = function() {
      const json = JSON.parse(xhr.response);
      expect(json).to.eql({ name: 'bar' });
      remove();
      expect(window.dvlp.cache).to.have.length(3);
      done();
    };
    xhr.open('GET', 'http://www.google.com/bar');
    xhr.send();
  });
  it('should disable/enable all network connections when using AJAX', function(done) {
    window.dvlp.disableNetwork();
    const xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', 'http://www.apple.com');
    } catch (err) {
      expect(err.message).to.include('network connections disabled');
      done();
    }
    window.dvlp.enableNetwork();
  });
  if (typeof fetch !== 'undefined') {
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
    it('should disable/enable all network connections when using fetch', function(done) {
      window.dvlp.disableNetwork();
      try {
        fetch('http://www.apple.com');
      } catch (err) {
        expect(err.message).to.include('network connections disabled');
        done();
      }
      window.dvlp.enableNetwork();
    });
  }
  if (typeof EventSource !== 'undefined') {
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
    it('should disable/enable all network connections when using EventSource', function(done) {
      window.dvlp.disableNetwork();
      try {
        new EventSource('http://someotherapi.com/feed');
      } catch (err) {
        expect(err.message).to.include('network connections disabled');
        done();
      }
      window.dvlp.enableNetwork();
    });
  }
  if (typeof WebSocket !== 'undefined') {
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
    it('should disable/enable all network connections when using WebSocket', function(done) {
      window.dvlp.disableNetwork();
      try {
        new WebSocket('http://someotherapi.com/feed');
      } catch (err) {
        expect(err.message).to.include('network connections disabled');
        done();
      }
      window.dvlp.enableNetwork();
    });
  }
});
