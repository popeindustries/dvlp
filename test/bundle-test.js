'use strict';

const {
  cleanBundles,
  destroyWorkers,
  bundle,
  resolveModuleId
} = require('../lib/bundler/index.js');
const config = require('../lib/config.js');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { resolve } = require('../lib/resolver/index.js');

const DEBUG = 'debug-4.1.1.js';
const LODASH = 'lodash-4.17.15.js';

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
    const filePath = await bundle(
      resolveModuleId('lodash', resolve('lodash', path.resolve('index.js')))
    );
    expect(filePath).to.equal(path.join(config.bundleDir, LODASH));
  });
  it('should return cached bundle filePath', async () => {
    await bundle(resolveModuleId('lodash', resolve('index.js', 'lodash')));
    const filePath = await bundle(
      resolveModuleId('lodash', resolve('lodash', path.resolve('index.js')))
    );
    expect(filePath).to.equal(path.join(config.bundleDir, LODASH));
  });
  it('should bundle with overridden config', async () => {
    const filePath = await bundle(
      resolveModuleId('debug', resolve('debug', path.resolve('index.js'))),
      'debug',
      undefined,
      {
        input: 'foo.js',
        output: { banner: '/* this is a test */', format: 'cjs' }
      }
    );
    const module = fs.readFileSync(filePath, 'utf8');
    expect(filePath).to.equal(path.join(config.bundleDir, DEBUG));
    expect(module).to.contain('/* this is a test */');
  });
  it('should skip bundling transient dependencies', async () => {
    const filePath = await bundle(
      resolveModuleId('debug', resolve('debug', path.resolve('index.js')))
    );
    const module = fs.readFileSync(filePath, 'utf8');
    expect(filePath).to.equal(path.join(config.bundleDir, DEBUG));
    expect(module).to.contain("import ms from 'ms';");
  });
});
