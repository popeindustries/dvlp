'use strict';

const {
  bundle,
  cleanBundles,
  destroyWorkers,
  resolveModuleId,
} = require('../src/bundler/index.js');
const config = require('../src/config.js');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { resolve } = require('../src/resolver/index.js');

const DEBUG = 'debug-4.1.1.js';
const LODASH = 'lodash-4.17.15.js';

describe('bundle()', () => {
  afterEach(async () => {
    cleanBundles();
    await destroyWorkers();
  });

  it('should return "undefined" if no module bundle found', () => {
    expect(bundle(resolveModuleId('foofoo'))).to.equal(undefined);
  });
  it('should bundle and return bundle filePath', async () => {
    const filePath = await bundle(
      resolveModuleId('lodash', resolve('lodash', path.resolve('index.js'))),
    );
    expect(filePath).to.equal(path.join(config.bundleDir, LODASH));
  });
  it('should bundle and add missing named exports', async () => {
    const filePath = await bundle(
      resolveModuleId('react', resolve('react', path.resolve('index.js'))),
    );
    const module = fs.readFileSync(filePath, 'utf8');
    expect(module).to.include('export default react');
    expect(module).to.include('export { Children, Component');
  });
  it('should return cached bundle filePath', async () => {
    await bundle(resolveModuleId('lodash', resolve('index.js', 'lodash')));
    const filePath = await bundle(
      resolveModuleId('lodash', resolve('lodash', path.resolve('index.js'))),
    );
    expect(filePath).to.equal(path.join(config.bundleDir, LODASH));
  });
  it('should bundle with custom Rollup config', async () => {
    const filePath = await bundle(
      resolveModuleId('debug', resolve('debug', path.resolve('index.js'))),
      path.resolve('test/fixtures/rollup.config.js'),
      'debug',
    );
    const module = fs.readFileSync(filePath, 'utf8');
    expect(filePath).to.equal(path.join(config.bundleDir, DEBUG));
    expect(module).to.contain('/* this is a test */');
  });
  it.skip('should handle custom Rollup load errors', async () => {
    const filePath = await bundle(
      resolveModuleId('debug', resolve('debug', path.resolve('index.js'))),
      path.resolve('test/fixtures/rollup-error-load.config.js'),
      'debug',
    );
    expect(filePath).to.equal(path.join(config.bundleDir, DEBUG));
  });
  it('should skip bundling transient dependencies', async () => {
    const filePath = await bundle(
      resolveModuleId('debug', resolve('debug', path.resolve('index.js'))),
    );
    const module = fs.readFileSync(filePath, 'utf8');
    expect(filePath).to.equal(path.join(config.bundleDir, DEBUG));
    expect(module).to.contain("import ms from 'ms';");
  });
});
