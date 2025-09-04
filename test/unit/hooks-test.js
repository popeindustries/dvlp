import { expect } from 'chai';
import fs from 'node:fs';
import { getBundleFilePath } from './utils.js';
import { Hooker } from '../../src/hooks/index.js';
import hooksFixture from './fixtures/hooks-bundle.mjs';
import { init } from 'cjs-module-lexer';
import path from 'node:path';
import transformBundleFixture from './fixtures/hooks-transform-bundle.mjs';
import transformFixture from './fixtures/hooks-transform.mjs';

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
  before(async () => {
    await init();
  });

  describe('bundle', () => {
    afterEach(() => {
      hooks && hooks.destroy();
    });

    it('should return "undefined" if no module bundle found', async () => {
      const hooks = new Hooker();
      expect(
        await hooks.bundleDependency('./dvlp/bundle-xxx/foofoo-0.0.0.js'),
      ).to.equal(undefined);
    });
    it('should bundle filePath', async () => {
      const hooks = new Hooker();
      const filePath = path.resolve(getBundleFilePath('debug'));
      await hooks.bundleDependency(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.include('export_default as default');
    });
    it('should bundle and add missing named exports', async () => {
      const hooks = new Hooker();
      const filePath = path.resolve(getBundleFilePath('react'));
      await hooks.bundleDependency(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.include('export_default as default');
      expect(module).to.include('export_Children as Children');
    });
    it('should return cached bundle', async () => {
      const hooks = new Hooker();
      const filePath = path.resolve(getBundleFilePath('debug'));
      fs.writeFileSync(filePath, 'this is cached');
      await hooks.bundleDependency(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.equal('this is cached');
      fs.unlinkSync(filePath);
    });
    it('should bundle with custom hook', async () => {
      const hooks = new Hooker('esbuild', hooksFixture);
      const filePath = path.resolve(getBundleFilePath('debug'));
      await hooks.bundleDependency(filePath, getResponse());
      const module = fs.readFileSync(filePath, 'utf8');
      expect(module).to.contain('this is bundled content for: browser.js');
    });
  });

  describe('transform', () => {
    it('should transform filePath', async () => {
      const hooks = new Hooker();
      const filePath = path.resolve('./test/unit/fixtures/www/dep.ts');
      const res = getResponse();
      await hooks.transform(filePath, '', res, {
        client: { ua: 'test' },
      });
      expect(res.body).to.contain('dep_default as default');
    });
    it('should transform filePath with Amaro', async () => {
      const hooks = new Hooker('amaro');
      const filePath = path.resolve('./test/unit/fixtures/www/dep.ts');
      const res = getResponse();
      await hooks.transform(filePath, '', res, {
        client: { ua: 'test' },
      });
      expect(res.body).to.contain("export default 'HI!'         ;");
    });
    it('should transform with custom hook', async () => {
      const hooks = new Hooker('esbuild', transformFixture);
      const filePath = path.resolve('./test/unit/fixtures/www/script.js');
      const res = getResponse();
      await hooks.transform(filePath, '', res, {
        client: { ua: 'test' },
      });
      expect(res.body).to.contain('this is transformed content for: script.js');
    });
    it('should add project dependencies to optional watcher', async () => {
      const added = [];
      const hooks = new Hooker('esbuild', transformBundleFixture, {
        add(filePath) {
          added.push(filePath);
        },
      });
      const filePath = path.resolve(
        './test/unit/fixtures/www/module-with-deps.js',
      );
      const res = getResponse();
      await hooks.transform(filePath, '', res, {
        client: { ua: 'test' },
      });
      expect(
        added.includes(path.resolve('./test/unit/fixtures/www/dep-esm.js')),
      ).to.be.true;
    });
  });
});
