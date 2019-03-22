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
    const packageDetails = findPackage(cache, 'index.js');
    expect(packageDetails).to.have.property('dir', process.cwd());
    expect(packageDetails).to.have.property(
      'path',
      path.resolve('package.json')
    );
  });
});
