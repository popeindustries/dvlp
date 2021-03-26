import config from '../src/config.js';
import { expect } from 'chai';
import fs from 'fs';
import Hooks from '../src/hooks/index.js';
import hooksFixture from './fixtures/hooks-bundle.mjs';
import path from 'path';
import transformBundleFixture from './fixtures/hooks-transform-bundle.js';
import transformFixture from './fixtures/hooks-transform.js';

const DEBUG = 'debug-4.3.1.js';
const REACT = 'react-17.0.1.js';
const LODASH = 'lodash-4.17.20.js';

function getResponse() {
  return {
    end(body) {
      this.body = body;
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
  describe('bundle', () => {
    afterEach(() => {
      hooks && hooks.destroy();
    });

    it('should return "undefined" if no module bundle found', async () => {
      const hooks = new Hooks();
      expect(await hooks.bundle('./dvlp/bundle-xxx/foofoo-0.0.0.js')).to.equal(undefined);
    });
    it('should bundle filePath', async () => {
      const hooks = new Hooks();
      const filePath = path.join(config.bundleDir, LODASH);
      await hooks.bundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.include('export_default as default');
    });
    it('should bundle and add missing named exports', async () => {
      const hooks = new Hooks();
      const filePath = path.join(config.bundleDir, REACT);
      await hooks.bundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.include('export_default as default');
      expect(module).to.include('export_Children as Children');
    });
    it('should return cached bundle', async () => {
      const hooks = new Hooks();
      const filePath = path.join(config.bundleDir, LODASH);
      fs.writeFileSync(filePath, 'this is cached');
      await hooks.bundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.equal('this is cached');
    });
    it('should bundle with custom hook', async () => {
      const hooks = new Hooks(hooksFixture);
      const filePath = path.join(config.bundleDir, DEBUG);
      await hooks.bundle(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.contain('this is bundled content for: debug-4.3.1.js');
    });
  });

  describe('transform', () => {
    it('should transform filePath', async () => {
      const hooks = new Hooks();
      const filePath = path.resolve('./test/fixtures/www/dep.ts');
      const res = getResponse();
      await hooks.transform(filePath, '', res, {
        client: { ua: 'test' },
      });
      expect(res.body).to.contain('dep_default as default');
    });
    it('should transform with custom hook', async () => {
      const hooks = new Hooks(transformFixture);
      const filePath = path.resolve('./test/fixtures/www/script.js');
      const res = getResponse();
      await hooks.transform(filePath, '', res, {
        client: { ua: 'test' },
      });
      expect(res.body).to.contain('this is transformed content for: script.js');
    });
    it('should add project dependencies to optional watcher', async () => {
      const added = [];
      const hooks = new Hooks(transformBundleFixture, {
        add(filePath) {
          added.push(filePath);
        },
      });
      const filePath = path.resolve('./test/fixtures/www/module-with-deps.js');
      const res = getResponse();
      await hooks.transform(filePath, '', res, {
        client: { ua: 'test' },
      });
      expect(added.includes(path.resolve('./test/fixtures/www/dep-esm.js'))).to.be.true;
    });
  });
});
