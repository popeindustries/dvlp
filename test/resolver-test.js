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
      it.only('should resolve a relative path to a js file in the same directory', () => {
        expect(resolver.resolve(path.resolve('foo.js'), './baz')).to.equal(
          path.resolve('baz.js')
        );
      });
    });
  });
});
