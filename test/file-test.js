'use strict';

const { expect } = require('chai');
const { expandPath, find } = require('../src/utils/file.js');
const path = require('path');

describe('file', () => {
  describe('expandPath()', () => {
    it('should return empty array for missing/empty filePath', () => {
      expect(expandPath()).to.eql([]);
      expect(expandPath(undefined)).to.eql([]);
      expect(expandPath(null)).to.eql([]);
      expect(expandPath('')).to.eql([]);
    });
    it('should return array for single filePath', () => {
      expect(expandPath('test/fixtures')).to.eql(['test/fixtures']);
    });
    it('should return array for glob filePath', () => {
      expect(expandPath('test/fixtures/mock/*.json')).to.eql([
        'test/fixtures/mock/1234.json',
        'test/fixtures/mock/5678.json',
        'test/fixtures/mock/9012.json',
        'test/fixtures/mock/json.json',
        'test/fixtures/mock/multi.json',
        'test/fixtures/mock/params.json',
        'test/fixtures/mock/search.json',
        'test/fixtures/mock/test.json',
      ]);
    });
    it('should return array for filePath with " " separator', () => {
      expect(
        expandPath('test/fixtures/mock/1234.json test/fixtures/mock/5678.json'),
      ).to.eql([
        'test/fixtures/mock/1234.json',
        'test/fixtures/mock/5678.json',
      ]);
    });
    it('should return array for filePath with "," separator', () => {
      expect(
        expandPath('test/fixtures/mock/1234.json,test/fixtures/mock/5678.json'),
      ).to.eql([
        'test/fixtures/mock/1234.json',
        'test/fixtures/mock/5678.json',
      ]);
    });
    it('should return array for filePath with ", " separator', () => {
      expect(
        expandPath(
          'test/fixtures/mock/1234.json, test/fixtures/mock/5678.json',
        ),
      ).to.eql([
        'test/fixtures/mock/1234.json',
        'test/fixtures/mock/5678.json',
      ]);
    });
    it('should return array for filePath with ";" separator', () => {
      expect(
        expandPath('test/fixtures/mock/1234.json;test/fixtures/mock/5678.json'),
      ).to.eql([
        'test/fixtures/mock/1234.json',
        'test/fixtures/mock/5678.json',
      ]);
    });
    it('should return empty array for missing/empty filePaths', () => {
      expect(expandPath([undefined, null, ''])).to.eql([]);
    });
    it('should return array for array of single filePaths', () => {
      expect(expandPath(['test/fixtures', 'test/fixtures/www'])).to.eql([
        'test/fixtures',
        'test/fixtures/www',
      ]);
    });
    it('should return array for array of glob filePaths', () => {
      expect(
        expandPath(['test/fixtures', 'test/fixtures/mock/*.json']),
      ).to.eql([
        'test/fixtures',
        'test/fixtures/mock/1234.json',
        'test/fixtures/mock/5678.json',
        'test/fixtures/mock/9012.json',
        'test/fixtures/mock/json.json',
        'test/fixtures/mock/multi.json',
        'test/fixtures/mock/params.json',
        'test/fixtures/mock/search.json',
        'test/fixtures/mock/test.json',
      ]);
    });
  });

  describe('find()', () => {
    it('should find file for absolute file path', () => {
      const p = path.resolve('test/fixtures/www/index.html');
      expect(find(p)).to.equal(p);
    });
    it('should find file for encoded absolute file path', () => {
      const p = path.resolve('test/fixtures/www/spå   ces.js');
      expect(find(encodeURI(p))).to.equal(p);
    });
    it('should find file for fully qualified request', () => {
      expect(
        find(
          { headers: {}, url: '/index.html' },
          { directories: [path.resolve('test/fixtures/www')] },
        ),
      ).to.equal(path.resolve('test/fixtures/www/index.html'));
    });
    it('should find file for HTML request missing extension', () => {
      expect(
        find(
          { headers: {}, url: '/index' },
          { directories: [path.resolve('test/fixtures/www')] },
        ),
      ).to.equal(path.resolve('test/fixtures/www/index.html'));
    });
    it('should find file for HTML request missing filename', () => {
      expect(
        find(
          { headers: {}, url: '/' },
          { directories: [path.resolve('test/fixtures/www')] },
        ),
      ).to.equal(path.resolve('test/fixtures/www/index.html'));
    });
    it('should find file for JS request missing extension', () => {
      expect(
        find(
          { headers: {}, url: '/module' },
          { directories: [path.resolve('test/fixtures/www')] },
        ),
      ).to.equal(path.resolve('test/fixtures/www/module.js'));
    });
    it('should find file for JS request missing extension with referer', () => {
      expect(
        find(
          { headers: { referer: '/index.js' }, url: '/module' },
          {
            directories: [path.resolve('test/fixtures/www')],
          },
        ),
      ).to.equal(path.resolve('test/fixtures/www/module.js'));
    });
    it('should find file for JS request missing package filename', () => {
      expect(
        find(
          { headers: {}, url: '/nested' },
          { directories: [path.resolve('test/fixtures/www')] },
        ),
      ).to.equal(path.resolve('test/fixtures/www/nested/index.js'));
    });
    it('should find file for JS request missing extension with type', () => {
      expect(
        find(
          { headers: {}, url: '/dep-esm' },
          { directories: [path.resolve('test/fixtures/www')], type: 'js' },
        ),
      ).to.equal(path.resolve('test/fixtures/www/dep-esm.js'));
    });
    it('should find file for JS string missing extension with type', () => {
      expect(
        find('/dep-esm', {
          directories: [path.resolve('test/fixtures/www')],
          type: 'js',
        }),
      ).to.equal(path.resolve('test/fixtures/www/dep-esm.js'));
    });
    it('should find file for JS string missing package filename', () => {
      expect(
        find('/nested', {
          directories: [path.resolve('test/fixtures/www')],
          type: 'js',
        }),
      ).to.equal(path.resolve('test/fixtures/www/nested/index.js'));
    });
    it('should find TS file for JS string with .js extension', () => {
      expect(
        find('/ts.js', {
          directories: [path.resolve('test/fixtures/www')],
          type: 'js',
        }),
      ).to.equal(path.resolve('test/fixtures/www/ts.ts'));
    });
  });
});
