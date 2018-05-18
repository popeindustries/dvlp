'use strict';

const { rollup } = require('rollup');
const { warn } = require('./log');
const debug = require('debug')('dvlp:module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readPkg = require('read-pkg-up');
const rollupResolve = require('rollup-plugin-node-resolve');
const rollupCommonjs = require('rollup-plugin-commonjs');

const CACHE_DIR_NAME = '.dvlp';
const CACHE_DIR = path.resolve(os.homedir(), CACHE_DIR_NAME);
const RE_JS_FILE = /\.js$/;
const ROLLUP_INPUT_DEFAULTS = {
  plugins: [
    rollupResolve({
      module: true,
      jsnext: true,
      main: true,
      browser: true
    }),
    rollupCommonjs()
  ],
  treeshake: false
};
const ROLLUP_OUTPUT_DEFAULTS = {
  format: 'es'
};

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

let cache = fs
  .readdirSync(CACHE_DIR)
  .filter((filepath) => RE_JS_FILE.test(filepath))
  .reduce((cache, filepath) => {
    cache[filepath] = true;
    return cache;
  }, {});

module.exports = {
  CACHE_DIR,
  CACHE_DIR_NAME,
  bundle,
  clearCache,
  resolve
};

/**
 * Resolve module id into cacheable id
 * @param {string} id
 * @returns {string}
 */
function resolve(id) {
  try {
    const main = require.resolve(id);
    const { pkg } = readPkg.sync({ cwd: path.dirname(main) });
    return `${encodeId(id)}-${pkg.version}.js`;
  } catch (err) {
    warn(`  unable to resolve path for ${id} module`);
    return '';
  }
}

/**
 * Trigger bundle of 'id'.
 * Returns Promise if bundling already in progress.
 * @param {string} [id]
 * @param {string} [resolvedId]
 * @returns {Promise<string>}
 */
function bundle(id, resolvedId = resolve(id)) {
  if (!resolvedId) {
    return null;
  }
  if (!id) {
    id = decodeId(resolvedId.slice(0, resolvedId.indexOf('-')));
  }

  const filepath = path.join(CACHE_DIR, resolvedId);

  if (!(resolvedId in cache)) {
    return doBundle(id, resolvedId, filepath);
  } else if (cache[resolvedId] instanceof Promise) {
    return cache[resolvedId];
  } else {
    return Promise.resolve(filepath);
  }
}

/**
 * Bundle module at 'id'
 * @param {string} id
 * @param {string} resolvedId
 * @param {string} filepath
 * @returns {Promise<string>}
 */
function doBundle(id, resolvedId, filepath) {
  return (cache[resolvedId] = new Promise(async (resolve, reject) => {
    const tmppath = path.resolve(resolvedId);

    // Rollup can only read from file
    fs.writeFileSync(tmppath, `export * from '${id}';\n`, 'utf8');

    try {
      const start = Date.now();
      const bundled = await rollup({ input: tmppath, ...ROLLUP_INPUT_DEFAULTS });
      await bundled.write({ file: filepath, ...ROLLUP_OUTPUT_DEFAULTS });

      debug(`bundled ${id} in ${Date.now() - start}ms`);
      cache[resolvedId] = true;
    } catch (err) {
      warn(`  unable to bundle ${id}`);
      delete cache[resolvedId];
      reject(err);
    } finally {
      fs.unlinkSync(tmppath);
    }

    resolve(filepath);
  }));
}

/**
 * Clear memory and disk cache
 */
function clearCache() {
  for (const resolvedId in cache) {
    try {
      fs.unlinkSync(path.join(CACHE_DIR, resolvedId));
    } catch (err) {
      // ignore
    } finally {
      delete cache[resolvedId];
    }
  }
}

function encodeId(id) {
  return id.replace(/\//g, '__');
}

function decodeId(id) {
  return id.replace(/__/g, '/');
}
