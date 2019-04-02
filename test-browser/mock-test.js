const { expect } = window.chai;

describe('Mock', () => {
  it('should respond to mocked fetch request', async () => {
    const res = await fetch('https://localhost:8000/foo', {
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
    xhr.open('GET', 'https://localhost:8000/foo');
    xhr.send();
  });
});
