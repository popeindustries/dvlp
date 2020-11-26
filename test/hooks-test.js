'use strict';

const config = require('../src/config.js');
const { expect } = require('chai');
const fs = require('fs');
const Hooks = require('../src/hooks/index.js');
const path = require('path');

const DEBUG = 'debug-4.2.0.js';
const REACT = 'react-17.0.1.js';
const LODASH = 'lodash-4.17.20.js';

function getResponse() {
  return {
    end() {
      this.finished = true;
    },
    metrics: {
      getEvent() {
        return 0;
      },
      recordEvent() {},
    },
    writeHead() {},
  };
}

/** @type { Hooks } */
let hooks;

describe('hooks()', () => {
  describe('onDependencyBundle', () => {
    afterEach(() => {
      hooks && hooks.destroy();
    });

    it('should return "undefined" if no module bundle found', async () => {
      const hooks = new Hooks();
      expect(
        await hooks.onDependencyBundle('./dvlp/bundle-xxx/foofoo-0.0.0.js'),
      ).to.equal(undefined);
    });
    it('should bundle filePath', async () => {
      const hooks = new Hooks();
      const filePath = path.join(config.bundleDir, LODASH);
      await hooks.onDependencyBundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.include('export default require_lodash();');
    });
    it('should bundle and add missing named exports', async () => {
      const hooks = new Hooks();
      const filePath = path.join(config.bundleDir, REACT);
      await hooks.onDependencyBundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.include('react_17_0_1_default as default');
      expect(module).to.include('export_Children as Children');
    });
    it('should return cached bundle', async () => {
      const hooks = new Hooks();
      const filePath = path.join(config.bundleDir, LODASH);
      fs.writeFileSync(filePath, 'this is cached');
      await hooks.onDependencyBundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.equal('this is cached');
    });
    it('should bundle with custom hook', async () => {
      const hooks = new Hooks('./test/fixtures/hooks-bundle.js');
      const filePath = path.join(config.bundleDir, DEBUG);
      await hooks.onDependencyBundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.contain('this is bundled content for: browser.js');
    });
    it.skip('should skip bundling transient dependencies', async () => {
      const hooks = new Hooks();
      const filePath = path.join(config.bundleDir, DEBUG);
      await hooks.onDependencyBundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.match(/import [^\s]+ from 'ms';/);
    });
  });
});
