'use strict';

const { expect } = require('chai');
const { findPackage } = require('../lib/resolve/package.js');
const path = require('path');

let cwd = process.cwd();

describe('resolve/package', () => {
  before(() => {
    process.chdir(path.resolve('test/fixtures'));
  });
  after(() => {
    process.chdir(cwd);
  });

  it('should retrieve package details for project file', () => {
    const cache = new Map();
    const pkgDetails = findPackage(cache, 'index.js');
    const pkgJson = path.resolve('package.json');
    expect(pkgDetails).to.have.property('dir', process.cwd());
    expect(pkgDetails).to.have.property('path', pkgJson);
    expect(cache.get(pkgJson)).to.equal(pkgDetails);
  });
});
