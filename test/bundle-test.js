'use strict';

const {
  cleanBundles,
  destroyWorkers,
  bundle,
  resolveModuleId
} = require('../lib/bundler/bundle.js');
const { expect } = require('chai');
const fs = require('fs');
const { bundleDir } = require('../lib/config.js');
const path = require('path');

const DEBUG = 'debug-4.1.1.js';
const LODASH = 'lodash-4.17.11.js';

describe('bundle()', () => {
  afterEach(() => {
    cleanBundles();
  });
  after(async () => {
    await destroyWorkers();
  });

  it('should return "null" if no module bundle found', () => {
    expect(bundle(resolveModuleId('foofoo'))).to.equal(null);
  });
  it('should bundle and return bundle filePath', async () => {
    const filePath = await bundle(resolveModuleId('lodash'));
    expect(filePath).to.equal(path.join(bundleDir, LODASH));
  });
  it('should return cached bundle filePath', async () => {
    await bundle(resolveModuleId('lodash'));
    const filePath = await bundle(resolveModuleId('lodash'));
    expect(filePath).to.equal(path.join(bundleDir, LODASH));
  });
  it('should bundle with overridden config', async () => {
    const filePath = await bundle(resolveModuleId('debug'), 'debug', {
      input: 'foo.js',
      output: { banner: '/* this is a test */', format: 'cjs' }
    });
    const module = fs.readFileSync(filePath, 'utf8');
    expect(filePath).to.equal(path.join(bundleDir, DEBUG));
    expect(module).to.contain('/* this is a test */');
  });
  it('should skip bundling transient dependencies', async () => {
    const filePath = await bundle(resolveModuleId('debug'));
    const module = fs.readFileSync(filePath, 'utf8');
    expect(filePath).to.equal(path.join(bundleDir, DEBUG));
    expect(module).to.contain("import ms from 'ms';");
  });
});
