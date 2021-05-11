import { clearResolverCache, resolve } from '../../src/resolver/index.js';
import { getPackage, resolvePackagePath } from '../../src/resolver/package.js';
import config from '../../src/config.js';
import { expect } from 'chai';
import { fileURLToPath } from 'url';
import path from 'path';
import { platform } from 'os';

describe('resolver', () => {
  before(() => {
    const cwd = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/resolver');
    config.directories.push(cwd);
    process.chdir(cwd);
  });
  after(() => {
    config.directories.pop();
    process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  });

  describe('package', () => {
    describe('resolvePackagePath()', () => {
      it('should return the cwd when passed a path outside of node_modules', () => {
        expect(resolvePackagePath(path.resolve('foo.js'))).to.eql(process.cwd());
      });
      it('should return a package path when passed a node_modules path', () => {
        expect(resolvePackagePath(path.resolve('node_modules/foo'))).to.eql(path.resolve('node_modules/foo'));
        expect(resolvePackagePath(path.resolve('node_modules/foo/bar/index.js'))).to.eql(
          path.resolve('node_modules/foo'),
        );
      });
      it('should return a scoped package path when passed a scoped node_modules path', () => {
        expect(resolvePackagePath(path.resolve('node_modules/@popeindustries/test'))).to.eql(
          path.resolve('node_modules/@popeindustries/test'),
        );
        expect(resolvePackagePath(path.resolve('node_modules/@popeindustries/test/test.js'))).to.eql(
          path.resolve('node_modules/@popeindustries/test'),
        );
      });
    });

    describe('getpackage()', () => {
      it('should return undefined if a package is not found', () => {
        expect(getPackage(path.resolve('node_modules/zing'))).to.equal(undefined);
      });
      it('should return details for the project root package', () => {
        const pkg = getPackage(process.cwd());
        expect(pkg).to.have.property('isProjectPackage', true);
        expect(pkg).to.have.property('manifestPath', path.resolve('package.json'));
      });
      it('should return details for the project root package from a nested project file', () => {
        const pkg = getPackage(path.resolve('foo.js'));
        expect(pkg).to.have.property('manifestPath', path.resolve('package.json'));
      });
      it('should return details for a node_modules package', () => {
        const pkg = getPackage(path.resolve('node_modules/foo'));
        expect(pkg).to.have.property('manifestPath', path.resolve('node_modules/foo/package.json'));
        expect(pkg).to.have.property('name', 'foo');
        expect(pkg).to.have.property('main', path.resolve('node_modules/foo/lib/bat.js'));
        expect(pkg.paths).to.contain(path.resolve('node_modules/foo/node_modules'));
        expect(pkg.paths).to.contain(path.resolve('node_modules'));
      });
      it('should return details for a scoped node_modules package', () => {
        const pkg = getPackage(path.resolve('node_modules/@popeindustries/test/test.js'));
        expect(pkg).to.have.property('manifestPath', path.resolve('node_modules/@popeindustries/test/package.json'));
        expect(pkg).to.have.property('name', '@popeindustries/test');
        expect(pkg).to.have.property('main', path.resolve('node_modules/@popeindustries/test/test.js'));
      });
      it('should correctly resolve "main" details property for a package with "module" field', () => {
        const pkg = getPackage(path.resolve('node_modules/module'));
        expect(pkg).to.have.property('main', path.resolve('node_modules/module/index.mjs'));
      });
      it('should correctly resolve "main" details property for a package with "module" and "browser" fields', () => {
        const pkg = getPackage(path.resolve('node_modules/module-browser'));
        expect(pkg).to.have.property('main', path.resolve('node_modules/module-browser/index.mjs'));
      });
    });
  });

  describe('resolve()', () => {
    afterEach(() => {
      clearResolverCache();
    });
    it("should not resolve a file if the reference file doesn't exist", () => {
      expect(resolve('', path.resolve('blah.js'))).to.equal(undefined);
    });
    it('should resolve an absolute path', () => {
      expect(resolve(path.resolve('foo.js'), path.resolve('foo.js'))).to.equal(path.resolve('foo.js'));
    });
    it('should resolve a relative path to a js file in the same directory', () => {
      expect(resolve('./baz', path.resolve('foo.js'))).to.equal(path.resolve('baz.js'));
    });
    it('should resolve a relative path to a js file in a child directory', () => {
      expect(resolve('./nested/foo', path.resolve('foo.js'))).to.equal(path.resolve('nested/foo.js'));
    });
    it('should resolve a relative path to a js file in a parent directory', () => {
      expect(resolve('../baz', path.resolve('nested/foo.js'))).to.equal(path.resolve('baz.js'));
    });
    it('should not resolve a js file with an unkown extension', () => {
      expect(resolve('./bar.blah', path.resolve('foo.js'))).to.equal(undefined);
    });
    it('should resolve a file name containing multiple "."', () => {
      expect(resolve('./foo.bar', path.resolve('foo.js'))).to.equal(path.resolve('foo.bar.js'));
    });
    it('should resolve a js package module path containing a package.json file and a "main" file field', () => {
      expect(resolve('foo', path.resolve('baz.js'))).to.equal(path.resolve('node_modules/foo/lib/bat.js'));
    });
    it('should resolve a js package module path containing a package.json file and a "main" directory field', () => {
      expect(resolve('foo-dir', path.resolve('baz.js'))).to.equal(path.resolve('node_modules/foo-dir/lib/index.js'));
    });
    it('should resolve a js package module path from a deeply nested location', () => {
      expect(resolve('foo', path.resolve('nested/nested/bar.js'))).to.equal(
        path.resolve('node_modules/foo/lib/bat.js'),
      );
    });
    it('should not resolve a sub-module of a js package module path from a deeply nested location', () => {
      expect(resolve('bar/bat', path.resolve('nested/nested/bar.js'))).to.equal(undefined);
    });
    it('should resolve a js package module source path', () => {
      expect(resolve('foo/lib/bat', path.resolve('baz.js'))).to.equal(path.resolve('node_modules/foo/lib/bat.js'));
    });
    it('should resolve a js package module path for a deeply nested package module', () => {
      expect(resolve('foo', path.resolve('node_modules/bar/node_modules/boo/index.js'))).to.equal(
        path.resolve('node_modules/foo/lib/bat.js'),
      );
    });
    it('should resolve a js package module source path for a deeply nested package module', () => {
      expect(resolve('foo/lib/bar', path.resolve('node_modules/bar/node_modules/boo/index.js'))).to.equal(
        path.resolve('node_modules/foo/lib/bar.js'),
      );
    });
    it('should resolve a js package module source path with nested package.json', () => {
      expect(resolve('bat/boo', path.resolve('index.js'))).to.equal(path.resolve('node_modules/bat/boo/index.esm.js'));
    });
    it('should resolve a js package module path in a parent node_modules directory', () => {
      expect(resolve('foo', path.resolve('nested/nested/bar.js'))).to.equal(
        path.resolve('node_modules/foo/lib/bat.js'),
      );
    });
    it('should resolve a scoped js package module path containing a package.json file and a "main" file field', () => {
      expect(resolve('@popeindustries/test', path.resolve('baz.js'))).to.equal(
        path.resolve('node_modules/@popeindustries/test/test.js'),
      );
    });
    it('should resolve a scoped js package module source path', () => {
      expect(resolve('@popeindustries/test/lib/bar', path.resolve('baz.js'))).to.equal(
        path.resolve('node_modules/@popeindustries/test/lib/bar.js'),
      );
    });
    it('should resolve a scoped js package css source path', () => {
      expect(resolve('@popeindustries/test/test.css', path.resolve('baz.js'))).to.equal(
        path.resolve('node_modules/@popeindustries/test/test.css'),
      );
    });
    it('should resolve an aliased main module file via simple "browser" field', () => {
      expect(resolve('browser', path.resolve('baz.js'))).to.equal(path.resolve('node_modules/browser/browser/foo.js'));
    });
    it('should resolve an aliased main file via "browser" hash', () => {
      expect(resolve('browser-hash', path.resolve('baz.js'))).to.equal(
        path.resolve('node_modules/browser-hash/browser/foo.js'),
      );
    });
    it('should resolve an aliased package with multiple aliases via "browser" hash', () => {
      expect(resolve('foo', path.resolve('node_modules/browser-hash/bar.js'))).to.equal(
        path.resolve('node_modules/browser-hash/foo.js'),
      );
    });
    it('should resolve an aliased package with a file via "browser" hash', () => {
      expect(resolve('bar', path.resolve('node_modules/browser-hash/foo.js'))).to.equal(
        path.resolve('node_modules/browser-hash/foo.js'),
      );
    });
    it('should resolve an aliased file with a package via "browser" hash', () => {
      expect(resolve('./bing', path.resolve('node_modules/browser-hash/foo.js'))).to.equal(
        path.resolve('node_modules/browser-hash/node_modules/bing/index.js'),
      );
      expect(resolve('./bing.js', path.resolve('node_modules/browser-hash/foo.js'))).to.equal(
        path.resolve('node_modules/browser-hash/node_modules/bing/index.js'),
      );
    });
    it('should resolve an aliased file with a package file via "browser" hash', () => {
      expect(resolve('./test.js', path.resolve('node_modules/browser-hash/foo.js'))).to.equal(
        path.resolve('node_modules/@popeindustries/test/test.js'),
      );
    });
    it('should resolve a main file with self-referencing alias via "browser" hash', () => {
      expect(resolve('alias', path.resolve('index.js'))).to.equal(path.resolve('node_modules/alias/index.ts'));
    });
    it('should resolve an aliased native module via a "browser" hash', () => {
      expect(resolve('net', path.resolve('node_modules/browser-hash/bar.js'))).to.equal(
        path.resolve('node_modules/browser-hash/foo.js'),
      );
    });
    it('should resolve a native module reference', () => {
      expect(resolve('http', path.resolve('foo.js'))).to.equal(undefined);
    });
    if (platform() !== 'win32') {
      it('should resolve a symlinked js package file', () => {
        expect(resolve('linked', path.resolve('baz.js'))).to.equal(path.resolve('linked/index.js'));
      });
    }
    it('should resolve self-referential package source reference', () => {
      expect(resolve('project/foo.js', path.resolve('baz.js'))).to.equal(path.resolve('foo.js'));
    });
    it('should resolve self-referential package reference', () => {
      expect(resolve('project', path.resolve('baz.js'))).to.equal(path.resolve('foo.js'));
    });
    it('should resolve package exports entry', () => {
      expect(resolve('exports', path.resolve('baz.js'))).to.equal(path.resolve('node_modules/exports/browser.js'));
    });
    it('should resolve nested package exports entry', () => {
      expect(resolve('exports/sub', path.resolve('baz.js'))).to.equal(
        path.resolve('node_modules/exports/sub-browser-dev.js'),
      );
    });
    it('should not resolve nested package module missing exports entry', () => {
      expect(resolve('exports/foo.js', path.resolve('baz.js'))).to.equal(undefined);
    });
  });
});
