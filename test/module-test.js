'use strict';

const { cleanCache, destroyWorkers, bundle } = require('../lib/utils/bundler');
const { expect } = require('chai');
const fs = require('fs');
const { bundleDir } = require('../lib/config');
const path = require('path');

const DEBUG = 'debug-3.1.0.js';
const LODASH = 'lodash-4.17.10.js';

describe('module', () => {
  afterEach(() => {
    cleanCache();
  });
  after(async () => {
    await destroyWorkers();
  });

  describe('bundle()', () => {
    it('should return "null" if no module bundle found', () => {
      expect(bundle('foofoo')).to.equal(null);
    });
    it('should bundle and return bundle filepath', async () => {
      const filepath = await bundle('lodash');
      expect(filepath).to.equal(path.join(bundleDir, LODASH));
    });
    it('should return cached bundle filepath', async () => {
      await bundle('lodash');
      const filepath = await bundle('lodash');
      expect(filepath).to.equal(path.join(bundleDir, LODASH));
    });
    it('should bundle with overridden config', async () => {
      const filepath = await bundle('debug', undefined, {
        input: 'foo.js',
        external: [],
        output: { banner: '/* this is a test */', format: 'cjs' }
      });
      const module = fs.readFileSync(filepath, 'utf8');
      expect(filepath).to.equal(path.join(bundleDir, DEBUG));
      expect(module).to.contain('/* this is a test */');
    });
  });
});
