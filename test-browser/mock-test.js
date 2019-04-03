const { expect } = window.chai;

describe('Mock', () => {
  it('should respond to mocked fetch request', async () => {
    const res = await fetch('http://www.google.com/foo', {
      mode: 'cors'
    });
    const json = await res.json();
    expect(json).to.eql({ name: 'foo' });
  });
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
  it('should respond to mocked EventSource', (done) => {
    const es = new EventSource('http://localhost:8080/feed');
    es.onopen = () => {
      expect(es.readyState).to.equal(1);
      es.close();
      done();
    };
  });
  it('should respond to mocked WebSocket', (done) => {
    const ws = new WebSocket('ws://localhost:8080/socket');
    ws.onopen = () => {
      expect(ws.readyState).to.equal(1);
      ws.close();
      done();
    };
  });

  describe('Push Events', () => {
    it('should push mocked EventSource event', (done) => {
      const es = new EventSource('http://localhost:8080/feed');
      es.onopen = () => {
        expect(es.readyState).to.equal(1);
        window.dvlp.pushEvent('http://localhost:8080/feed', 'open');
      };
      es.addEventListener('foo', (event) => {
        expect(event.data).to.equal('{"title":"open"}');
        es.close();
        done();
      });
    });
    it('should push mocked WebSocket event', (done) => {
      const ws = new WebSocket('ws://localhost:8080/socket');
      ws.onopen = () => {
        expect(ws.readyState).to.equal(1);
        window.dvlp.pushEvent('ws://localhost:8080/socket', 'foo event');
      };
      ws.onmessage = (event) => {
        expect(event.data).to.equal('{"title":"foo"}');
        ws.close();
        done();
      };
    });
  });
});
