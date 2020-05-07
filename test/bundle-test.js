'use strict';

const {
  bundle,
  cleanBundles,
  destroyWorkers,
  resolveModuleId,
} = require('../src/bundler/index.js');
const config = require('../src/config.js');
const { expect } = require('chai');
const {
  getDefaultRollupConfig,
} = require('../src/utils/default-rollup-config.js');
const fs = require('fs');
const path = require('path');
const { resolve } = require('../src/resolver/index.js');

const DEBUG = 'debug-4.1.1.js';
const LODASH = 'lodash-4.17.15.js';

describe('bundle()', () => {
  afterEach(() => {
    cleanBundles();
  });
  after(async () => {
    await destroyWorkers();
  });

  it('should return "undefined" if no module bundle found', () => {
    expect(
      bundle(resolveModuleId('foofoo'), getDefaultRollupConfig()),
    ).to.equal(undefined);
  });
  it('should bundle and return bundle filePath', async () => {
    const filePath = await bundle(
      resolveModuleId('lodash', resolve('lodash', path.resolve('index.js'))),
      getDefaultRollupConfig(),
    );
    expect(filePath).to.equal(path.join(config.bundleDir, LODASH));
  });
  it('should return cached bundle filePath', async () => {
    await bundle(resolveModuleId('lodash', resolve('index.js', 'lodash')));
    const filePath = await bundle(
      resolveModuleId('lodash', resolve('lodash', path.resolve('index.js'))),
      getDefaultRollupConfig(),
    );
    expect(filePath).to.equal(path.join(config.bundleDir, LODASH));
  });
  it('should bundle with overridden config', async () => {
    const filePath = await bundle(
      resolveModuleId('debug', resolve('debug', path.resolve('index.js'))),
      {
        input: 'foo.js',
        output: { banner: '/* this is a test */', format: 'cjs' },
      },
      'debug',
    );
    const module = fs.readFileSync(filePath, 'utf8');
    expect(filePath).to.equal(path.join(config.bundleDir, DEBUG));
    expect(module).to.contain('/* this is a test */');
  });
  it('should skip bundling transient dependencies', async () => {
    const filePath = await bundle(
      resolveModuleId('debug', resolve('debug', path.resolve('index.js'))),
      getDefaultRollupConfig(),
    );
    const module = fs.readFileSync(filePath, 'utf8');
    expect(filePath).to.equal(path.join(config.bundleDir, DEBUG));
    expect(module).to.contain("import ms from 'ms';");
  });
});
