import { expect } from 'chai';
import { getDeterministicPort } from '../../src/utils/port.js';

describe('port', () => {
  describe('getDeterministicPort', () => {
    it('should return port number within given range', () => {
      expect(
        getDeterministicPort(
          '/path/to/project --port 8888 --transpiler ./scripts/transpile.js --silent test/www',
          3000,
          8000,
        ),
      ).to.equal(5657);
    });
    it('should return port number within given range for same args in different project dirs', () => {
      expect(
        getDeterministicPort(
          '/path/to/project --port 8888 --transpiler ./scripts/transpile.js --silent test/www',
          3000,
          8000,
        ),
      ).to.equal(5657);
      expect(
        getDeterministicPort(
          '/path/to/other/project --port 8888 --transpiler ./scripts/transpile.js --silent test/www',
          3000,
          8000,
        ),
      ).to.equal(7350);
    });
    it('should return port number within given range for different args in same project dir', () => {
      expect(
        getDeterministicPort(
          '/path/to/project --port 8888 --transpiler ./scripts/transpile.js --silent test/www',
          3000,
          8000,
        ),
      ).to.equal(5657);
      expect(
        getDeterministicPort(
          '/path/to/project --port 8080 --transpiler ./scripts/transpile.js --silent www',
          3000,
          8000,
        ),
      ).to.equal(7360);
    });
  });
});
