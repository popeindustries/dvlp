'use strict';

const {
  getPackage,
  resolvePackagePath
} = require('../lib/resolver/package.js');
const { expect } = require('chai');
const path = require('path');
const Resolver = require('../lib/resolver/index.js');

describe.only('resolver', () => {
  before(() => {
    process.chdir(path.resolve(__dirname, 'fixtures/resolver'));
  });
  after(() => {
    process.chdir(path.resolve(__dirname, '..'));
  });

  describe('package', () => {
    describe('resolvePackagePath()', () => {
      it('should return the cwd when passed a path outside of node_modules', () => {
        expect(resolvePackagePath(path.resolve('foo.js'))).to.eql(
          process.cwd()
        );
        expect(resolvePackagePath(path.resolve('node_modules'))).to.eql(
          process.cwd()
        );
      });
      it('should return a package path when passed a node_modules path', () => {
        expect(resolvePackagePath(path.resolve('node_modules/foo'))).to.eql(
          path.resolve('node_modules/foo')
        );
        expect(
          resolvePackagePath(path.resolve('node_modules/foo/bar/index.js'))
        ).to.eql(path.resolve('node_modules/foo'));
      });
      it('should return a scoped package path when passed a scoped node_modules path', () => {
        expect(
          resolvePackagePath(path.resolve('node_modules/@popeindustries/test'))
        ).to.eql(path.resolve('node_modules/@popeindustries/test'));
        expect(
          resolvePackagePath(
            path.resolve('node_modules/@popeindustries/test/test.js')
          )
        ).to.eql(path.resolve('node_modules/@popeindustries/test'));
      });
    });

    describe('getpackage()', () => {
      it('should return undefined if a package is not found', () => {
        expect(getPackage('node_modules/zing')).to.equal(undefined);
      });
      it('should return details for the project root package', () => {
        const pkg = getPackage(process.cwd());
        expect(pkg).to.have.property('isNodeModule', false);
        expect(pkg).to.have.property(
          'manifestPath',
          path.resolve('package.json')
        );
      });
      it('should return details for the project root package from a nested project file', () => {
        const pkg = getPackage(path.resolve('foo.js'));
        expect(pkg).to.have.property(
          'manifestPath',
          path.resolve('package.json')
        );
      });
      it('should return details for a node_modules package', () => {
        const pkg = getPackage(path.resolve('node_modules/foo'));
        expect(pkg).to.have.property(
          'manifestPath',
          path.resolve('node_modules/foo/package.json')
        );
        expect(pkg).to.have.property('name', 'foo');
        // expect(pkg).to.have.property(
        //   'main',
        //   path.resolve('node_modules/foo/lib/bat.js')
        // );
        expect(pkg.paths).to.contain(
          path.resolve('node_modules/foo/node_modules')
        );
        expect(pkg.paths).to.contain(path.resolve('node_modules'));
      });
      it('should return details for a scoped node_modules package', () => {
        const pkg = getPackage(
          path.resolve('node_modules/@popeindustries/test/test.js')
        );
        expect(pkg).to.have.property(
          'manifestPath',
          path.resolve('node_modules/@popeindustries/test/package.json')
        );
        expect(pkg).to.have.property('name', '@popeindustries/test');
        expect(pkg).to.have.property(
          'main',
          path.resolve('node_modules/@popeindustries/test/test.js')
        );
      });
    });
  });

  describe('resolver', () => {
    let resolver;
    beforeEach(() => {
      resolver = new Resolver();
    });
    afterEach(() => {
      resolver.destroy();
    });

    describe('resolve()', () => {
      it("should not resolve a file if the reference file doesn't exist", () => {
        expect(resolver.resolve(path.resolve('blah.js'), '')).to.equal(
          undefined
        );
      });
      it('should resolve an absolute path', () => {
        expect(
          resolver.resolve(path.resolve('foo.js'), path.resolve('foo.js'))
        ).to.equal(path.resolve('foo.js'));
      });
      it('should resolve a relative path to a js file in the same directory', () => {
        expect(resolver.resolve(path.resolve('foo.js'), './baz')).to.equal(
          path.resolve('baz.js')
        );
      });
      it('should resolve a relative path to a js file in a child directory', () => {
        expect(
          resolver.resolve(path.resolve('foo.js'), './nested/foo')
        ).to.equal(path.resolve('nested/foo.js'));
      });
      it('should resolve a relative path to a js file in a parent directory', () => {
        expect(
          resolver.resolve(path.resolve('nested/foo.js'), '../baz')
        ).to.equal(path.resolve('baz.js'));
      });
      it('should not resolve a js file with an unkown extension', () => {
        expect(resolver.resolve(path.resolve('foo.js'), './bar.blah')).to.equal(
          undefined
        );
      });
      it('should resolve a file name containing multiple "."', () => {
        expect(resolver.resolve(path.resolve('foo.js'), './foo.bar')).to.equal(
          path.resolve('foo.bar.js')
        );
      });
      it('should resolve a js package module path containing a package.json file and a "main" file field', () => {
        expect(resolver.resolve(path.resolve('baz.js'), 'foo')).to.equal(
          path.resolve('node_modules/foo/lib/bat.js')
        );
      });
      it('should resolve a js package module path containing a package.json file and a "main" directory field', () => {
        expect(resolver.resolve(path.resolve('baz.js'), 'foo-dir')).to.equal(
          path.resolve('node_modules/foo-dir/lib/index.js')
        );
      });
      it('should resolve a js package module path from a deeply nested location', () => {
        expect(
          resolver.resolve(path.resolve('nested/nested/bar.js'), 'foo')
        ).to.equal(path.resolve('node_modules/foo/lib/bat.js'));
      });
      it('should not resolve a sub-module of a js package module path from a deeply nested location', () => {
        expect(
          resolver.resolve(path.resolve('nested/nested/bar.js'), 'bar/bat')
        ).to.equal(undefined);
      });
      it('should resolve a js package module source path', () => {
        expect(
          resolver.resolve(path.resolve('baz.js'), 'foo/lib/bat')
        ).to.equal(path.resolve('node_modules/foo/lib/bat.js'));
      });
      it('should resolve a js package module path for a deeply nested package module', () => {
        expect(
          resolver.resolve(
            path.resolve('node_modules/bar/node_modules/bat/index.js'),
            'foo'
          )
        ).to.equal(path.resolve('node_modules/foo/lib/bat.js'));
      });
      it('should resolve a js package module source path for a deeply nested package module', () => {
        expect(
          resolver.resolve(
            path.resolve('node_modules/bar/node_modules/bat/index.js'),
            'foo/lib/bar'
          )
        ).to.equal(path.resolve('node_modules/foo/lib/bar.js'));
      });
      it('should resolve a scoped js package module path containing a package.json file and a "main" file field', () => {
        expect(
          resolver.resolve(path.resolve('baz.js'), '@popeindustries/test')
        ).to.equal(path.resolve('node_modules/@popeindustries/test/test.js'));
      });
      it('should resolve a scoped js package module source path', () => {
        expect(
          resolver.resolve(
            path.resolve('baz.js'),
            '@popeindustries/test/lib/bar'
          )
        ).to.equal(
          path.resolve('node_modules/@popeindustries/test/lib/bar.js')
        );
      });
      it('should resolve an aliased main module file via simple "browser" field', () => {
        expect(resolver.resolve(path.resolve('baz.js'), 'browser')).to.equal(
          path.resolve('node_modules/browser/browser/foo.js')
        );
      });
      it.skip('should resolve an aliased main file via "browser" hash', () => {
        expect(
          resolver.resolve(path.resolve('baz.js'), 'browser-hash')
        ).to.equal(path.resolve('node_modules/browser-hash/browser/foo.js'));
      });
      it.skip('should resolve a disabled package via "browser" hash', () => {
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/foo.js'),
            'bat'
          )
        ).to.equal(false);
      });
      it.skip('should resolve an aliased package with multiple aliases via "browser" hash', () => {
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/bar.js'),
            'foo'
          )
        ).to.equal(path.resolve('node_modules/browser-hash/foo.js'));
      });
      it.skip('should resolve an aliased package with a file via "browser" hash', () => {
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/foo.js'),
            'bar'
          )
        ).to.equal(path.resolve('node_modules/browser-hash/foo.js'));
      });
      it.skip('should resolve a disabled file via "browser" hash', () => {
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/foo.js'),
            './bar'
          )
        ).to.equal(false);
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/foo.js'),
            './bar.js'
          )
        ).to.equal(false);
        expect(
          resolver.resolve(path.resolve('foo.js'), 'browser-hash/bar')
        ).to.equal(false);
      });
      it.skip('should resolve an aliased file with a package via "browser" hash', () => {
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/foo.js'),
            './bing'
          )
        ).to.equal(
          path.resolve('node_modules/browser-hash/node_modules/bing/index.js')
        );
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/foo.js'),
            './bing.js'
          )
        ).to.equal(
          path.resolve('node_modules/browser-hash/node_modules/bing/index.js')
        );
      });
      it.skip('should resolve an aliased native module via a "browser" hash', () => {
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/foo.js'),
            'http'
          )
        ).to.equal(false);
        expect(
          resolver.resolve(
            path.resolve('node_modules/browser-hash/bar.js'),
            'net'
          )
        ).to.equal(path.resolve('node_modules/browser-hash/foo.js'));
      });
      it('should resolve a native module reference', () => {
        expect(resolver.resolve(path.resolve('foo.js'), 'http')).to.equal(
          undefined
        );
      });
      it.skip('should resolve root project main file with "browser" alias', () => {
        expect(resolver.resolve(path.resolve('foo.js'), 'project')).to.equal(
          path.resolve('index.js')
        );
      });
    });
  });
});
