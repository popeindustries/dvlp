'use strict';

const { expect } = require('chai');
const { injectReloadScript } = require('../lib/utils');
const { ServerResponse } = require('http');

function getBody(res) {
  const output = res.output.filter((chunk) => typeof chunk === 'string').join('');
  return output.replace(res._header, '');
}

describe('utils', () => {
  describe('injectReloadScript()', () => {
    it('should inject script into buffered response', () => {
      const res = new ServerResponse({
        method: 'GET',
        httpVersionMajor: 1,
        httpVersionMinor: 1
      });
      injectReloadScript(res);
      res.end('</body>');
      expect(getBody(res)).to.include(
        '<script src="http://localhost:35729/livereload.js"></script>\n</body>'
      );
    });
    it('should inject script into streamed response', () => {
      const res = new ServerResponse({
        method: 'GET',
        httpVersionMajor: 1,
        httpVersionMinor: 1
      });
      injectReloadScript(res);
      res.write('</body>');
      expect(getBody(res)).to.include(
        '<script src="http://localhost:35729/livereload.js"></script>\n</body>'
      );
    });
    it('should update Content-Length header with correct length if injected', () => {
      const res = new ServerResponse({
        method: 'GET',
        httpVersionMajor: 1,
        httpVersionMinor: 1
      });
      injectReloadScript(res);
      const body = '</body>';
      res.setHeader('Content-Length', Buffer.byteLength(body));
      res.write(body);
      // expect(res.get)
    });
  });
});
