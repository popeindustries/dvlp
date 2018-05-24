'use strict';

const { expect } = require('chai');
const { CACHE_DIR, cleanCache, destroyWorkers, bundle } = require('../lib/utils/module');
const path = require('path');

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
      expect(filepath).to.equal(path.join(CACHE_DIR, LODASH));
    });
    it('should return cached bundle filepath', async () => {
      await bundle('lodash');
      const filepath = await bundle('lodash');
      expect(filepath).to.equal(path.join(CACHE_DIR, LODASH));
    });
  });
});
