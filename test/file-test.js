'use strict';

const { expect } = require('chai');
const { importModule } = require('../lib/utils/file');
const path = require('path');

describe('file', () => {
  describe('importModule()', () => {
    it('should return an es6 module', () => {
      const module = importModule(path.resolve(__dirname, 'fixtures/www/config.esm.js'));
      expect(module).to.have.property('default');
      expect(module.default).to.have.property('dep', 'HI!');
    });
    it('should return a cjs module', () => {
      const module = importModule(path.resolve(__dirname, 'fixtures/www/config.js'));
      expect(module).to.have.property('default');
      expect(module.default).to.have.property('dep', 'HI!');
    });
  });
});
