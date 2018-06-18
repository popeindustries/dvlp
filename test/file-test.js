'use strict';

const { expect } = require('chai');
const { find, importModule, urlMatchesFilepath } = require('../lib/utils/file');
const path = require('path');

describe('file', () => {
  describe('find()', () => {
    it('should find file for fully qualified request', () => {
      expect(
        find(
          { headers: {}, url: '/index.html' },
          { directories: [path.resolve('test/fixtures/www')] }
        )
      ).to.equal(path.resolve('test/fixtures/www/index.html'));
    });
    it('should find file for HTML request missing extension', () => {
      expect(
        find({ headers: {}, url: '/index' }, { directories: [path.resolve('test/fixtures/www')] })
      ).to.equal(path.resolve('test/fixtures/www/index.html'));
    });
    it('should find file for HTML request missing filename', () => {
      expect(
        find({ headers: {}, url: '/' }, { directories: [path.resolve('test/fixtures/www')] })
      ).to.equal(path.resolve('test/fixtures/www/index.html'));
    });
    it('should find file for JS request missing extension', () => {
      expect(
        find({ headers: {}, url: '/module' }, { directories: [path.resolve('test/fixtures/www')] })
      ).to.equal(path.resolve('test/fixtures/www/module.js'));
    });
    it('should find file for JS request missing extension with referer', () => {
      expect(
        find(
          { headers: { referer: '/index.js' }, url: '/module' },
          {
            directories: [path.resolve('test/fixtures/www')]
          }
        )
      ).to.equal(path.resolve('test/fixtures/www/module.js'));
    });
    it('should find file for JS request missing filename', () => {
      expect(
        find({ headers: {}, url: '/nested' }, { directories: [path.resolve('test/fixtures/www')] })
      ).to.equal(path.resolve('test/fixtures/www/nested/index.js'));
    });
    it('should find file for JS request missing extension with type', () => {
      expect(
        find(
          { headers: {}, url: '/dep' },
          { directories: [path.resolve('test/fixtures/www')], type: 'js' }
        )
      ).to.equal(path.resolve('test/fixtures/www/dep.js'));
    });
  });

  describe('importModule()', () => {
    it('should return an es6 module', () => {
      const module = importModule(path.resolve(__dirname, 'fixtures/config.esm.js'));
      expect(module).to.have.property('default');
      expect(module.default).to.have.property('dep', 'HI!');
    });
    it('should return a cjs module', () => {
      const module = importModule(path.resolve(__dirname, 'fixtures/config.js'));
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
