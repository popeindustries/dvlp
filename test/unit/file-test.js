import { expandPath, find, isCjsFile, isEsmFile } from '../../src/utils/file.js';
import { expect } from 'chai';
import path from 'path';

describe('file', () => {
  describe('expandPath()', () => {
    it('should return empty array for missing/empty filePath', () => {
      expect(expandPath()).to.eql([]);
      expect(expandPath(undefined)).to.eql([]);
      expect(expandPath(null)).to.eql([]);
      expect(expandPath('')).to.eql([]);
    });
    it('should return array for single filePath', () => {
      expect(expandPath('test/unit/fixtures')).to.eql(['test/unit/fixtures']);
    });
    it('should return array for glob filePath', () => {
      expect(expandPath('test/unit/fixtures/mock/*.json')).to.eql([
        'test/unit/fixtures/mock/1234.json',
        'test/unit/fixtures/mock/5678.json',
        'test/unit/fixtures/mock/9012.json',
        'test/unit/fixtures/mock/json.json',
        'test/unit/fixtures/mock/multi.json',
        'test/unit/fixtures/mock/params.json',
        'test/unit/fixtures/mock/search.json',
        'test/unit/fixtures/mock/test.json',
      ]);
    });
    it('should return array for filePath with " " separator', () => {
      expect(expandPath('test/unit/fixtures/mock/1234.json test/unit/fixtures/mock/5678.json')).to.eql([
        'test/unit/fixtures/mock/1234.json',
        'test/unit/fixtures/mock/5678.json',
      ]);
    });
    it('should return array for filePath with "," separator', () => {
      expect(expandPath('test/unit/fixtures/mock/1234.json,test/unit/fixtures/mock/5678.json')).to.eql([
        'test/unit/fixtures/mock/1234.json',
        'test/unit/fixtures/mock/5678.json',
      ]);
    });
    it('should return array for filePath with ", " separator', () => {
      expect(expandPath('test/unit/fixtures/mock/1234.json, test/unit/fixtures/mock/5678.json')).to.eql([
        'test/unit/fixtures/mock/1234.json',
        'test/unit/fixtures/mock/5678.json',
      ]);
    });
    it('should return array for filePath with ";" separator', () => {
      expect(expandPath('test/unit/fixtures/mock/1234.json;test/unit/fixtures/mock/5678.json')).to.eql([
        'test/unit/fixtures/mock/1234.json',
        'test/unit/fixtures/mock/5678.json',
      ]);
    });
    it('should return empty array for missing/empty filePaths', () => {
      expect(expandPath([undefined, null, ''])).to.eql([]);
    });
    it('should return array for array of single filePaths', () => {
      expect(expandPath(['test/unit/fixtures', 'test/unit/fixtures/www'])).to.eql([
        'test/unit/fixtures',
        'test/unit/fixtures/www',
      ]);
    });
    it('should return array for array of glob filePaths', () => {
      expect(expandPath(['test/unit/fixtures', 'test/unit/fixtures/mock/*.json'])).to.eql([
        'test/unit/fixtures',
        'test/unit/fixtures/mock/1234.json',
        'test/unit/fixtures/mock/5678.json',
        'test/unit/fixtures/mock/9012.json',
        'test/unit/fixtures/mock/json.json',
        'test/unit/fixtures/mock/multi.json',
        'test/unit/fixtures/mock/params.json',
        'test/unit/fixtures/mock/search.json',
        'test/unit/fixtures/mock/test.json',
      ]);
    });
  });

  describe('find()', () => {
    it('should find file for absolute file path', () => {
      const p = path.resolve('test/unit/fixtures/www/index.html');
      expect(find(p)).to.equal(p);
    });
    it('should find file for encoded absolute file path', () => {
      const p = path.resolve('test/unit/fixtures/www/spå   ces.js');
      expect(find(encodeURI(p))).to.equal(p);
    });
    it('should find file for fully qualified request', () => {
      expect(
        find({ headers: {}, url: '/index.html' }, { directories: [path.resolve('test/unit/fixtures/www')] }),
      ).to.equal(path.resolve('test/unit/fixtures/www/index.html'));
    });
    it('should find file for HTML request missing extension', () => {
      expect(find({ headers: {}, url: '/index' }, { directories: [path.resolve('test/unit/fixtures/www')] })).to.equal(
        path.resolve('test/unit/fixtures/www/index.html'),
      );
    });
    it('should find file for HTML request missing filename', () => {
      expect(find({ headers: {}, url: '/' }, { directories: [path.resolve('test/unit/fixtures/www')] })).to.equal(
        path.resolve('test/unit/fixtures/www/index.html'),
      );
    });
    it('should find file for JS request missing extension', () => {
      expect(find({ headers: {}, url: '/module' }, { directories: [path.resolve('test/unit/fixtures/www')] })).to.equal(
        path.resolve('test/unit/fixtures/www/module.js'),
      );
    });
    it('should find file for JS request missing extension with referer', () => {
      expect(
        find(
          { headers: { referer: '/index.js' }, url: '/module' },
          {
            directories: [path.resolve('test/unit/fixtures/www')],
          },
        ),
      ).to.equal(path.resolve('test/unit/fixtures/www/module.js'));
    });
    it('should find file for JS request missing package filename', () => {
      expect(find({ headers: {}, url: '/nested' }, { directories: [path.resolve('test/unit/fixtures/www')] })).to.equal(
        path.resolve('test/unit/fixtures/www/nested/index.js'),
      );
    });
    it('should find file for JS request missing extension with type', () => {
      expect(
        find({ headers: {}, url: '/dep-esm' }, { directories: [path.resolve('test/unit/fixtures/www')], type: 'js' }),
      ).to.equal(path.resolve('test/unit/fixtures/www/dep-esm.js'));
    });
    it('should find file for JS string missing extension with type', () => {
      expect(
        find('/dep-esm', {
          directories: [path.resolve('test/unit/fixtures/www')],
          type: 'js',
        }),
      ).to.equal(path.resolve('test/unit/fixtures/www/dep-esm.js'));
    });
    it('should find file for JS string missing package filename', () => {
      expect(
        find('/nested', {
          directories: [path.resolve('test/unit/fixtures/www')],
          type: 'js',
        }),
      ).to.equal(path.resolve('test/unit/fixtures/www/nested/index.js'));
    });
    it('should find TS file for JS string with .js extension', () => {
      expect(
        find('/ts.js', {
          directories: [path.resolve('test/unit/fixtures/www')],
          type: 'js',
        }),
      ).to.equal(path.resolve('test/unit/fixtures/www/ts.ts'));
    });
  });

  describe('isCjsFile()', () => {
    it('should return true for .js file with "require()"', () => {
      const filePath = path.resolve('test/unit/fixtures/app.js');
      expect(isCjsFile(filePath)).to.be.true;
    });
    it('should return true for .cjs file', () => {
      const filePath = path.resolve('test/unit/fixtures/app.cjs');
      expect(isCjsFile(filePath)).to.be.true;
    });
    it('should return true for .json file', () => {
      const filePath = path.resolve('test/unit/fixtures/package.json');
      expect(isCjsFile(filePath)).to.be.true;
    });
  });

  describe('isEsmFile()', () => {
    it('should return true for .js file with "import"', () => {
      const filePath = path.resolve('test/unit/fixtures/file.esm.js');
      expect(isEsmFile(filePath)).to.be.true;
    });
    it('should return false for script with no imports/exports', () => {
      const filePath = path.resolve('test/unit/fixtures/script.js');
      expect(isEsmFile(filePath)).to.be.false;
    });
    it('should return true for .mjs file', () => {
      const filePath = path.resolve('test/unit/fixtures/hooks-bundle.mjs');
      expect(isEsmFile(filePath)).to.be.true;
    });
  });
});
