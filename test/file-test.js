'use strict';

const { expect } = require('chai');
const { importModule, urlMatchesFilepath } = require('../lib/utils/file');
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

  describe('urlMatchesFilepath()', () => {
    it('should match same basename', () => {
      expect(urlMatchesFilepath('/foo/bar.js', '/some/path/bar.js')).to.equal(true);
      expect(urlMatchesFilepath('/foo/bar.js', '/some/path/bar.css')).to.equal(false);
    });
    it('should match same basename with missing extension', () => {
      expect(urlMatchesFilepath('/foo/bar', '/some/path/bar.js')).to.equal(true);
    });
    it('should match same dirname for package index', () => {
      expect(urlMatchesFilepath('/foo/bar', '/some/path/bar/index.js')).to.equal(true);
    });
  });
});
