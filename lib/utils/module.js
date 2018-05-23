'use strict';

const { warn } = require('./log');
const bundler = require('./bundler');
const debug = require('debug')('dvlp:module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readPkg = require('read-pkg-up');
const workerFarm = require('worker-farm');

const CACHE_DIR_NAME = '.dvlp';
const CACHE_DIR = path.resolve(os.homedir(), CACHE_DIR_NAME);
const LOCAL_CACHE_DIR = path.resolve(process.cwd(), CACHE_DIR_NAME);
const MAX_WORKERS = parseInt(process.env.WORKERS, 10) || 0;
const RE_JS_FILE = /\.js$/;

const testing = process.env.NODE_ENV === 'test';
let workers;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}
if (!fs.existsSync(LOCAL_CACHE_DIR)) {
  fs.mkdirSync(LOCAL_CACHE_DIR);
}

const cache = fs
  .readdirSync(CACHE_DIR)
  .filter((resolvedId) => RE_JS_FILE.test(resolvedId))
  .reduce((cache, resolvedId) => {
    cache[resolvedId] = true;
    return cache;
  }, {});

process.on('exit', () => {
  if (testing) {
    cleanCache();
  }
});

module.exports = {
  CACHE_DIR,
  CACHE_DIR_NAME,
  bundle,
  cleanCache,
  destroyWorkers,
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
    const start = Date.now();

    getBundler()(id, resolvedId, filepath, LOCAL_CACHE_DIR, (err) => {
      if (err) {
        warn(`  unable to bundle ${id}`);
        delete cache[resolvedId];
        return reject(err);
      }

      debug(`bundled ${id} in ${Date.now() - start}ms`);
      cache[resolvedId] = true;
      resolve(filepath);
    });
  }));
}

/**
 * Retrieve bundler.
 * Starts workers if MAX_WORKERS > 0,
 * otherwise uses bundler directly
 * @returns {(string, string, string, string, (Error) => void) => void}
 */
function getBundler() {
  if (!MAX_WORKERS) {
    return bundler;
  }

  if (!workers) {
    workers = workerFarm({ maxConcurrentWorkers: MAX_WORKERS }, require.resolve('./bundler.js'));
    debug(`spawned ${MAX_WORKERS} bundler workers`);
  }

  return workers;
}

/**
 * Clear memory and disk cache
 */
function cleanCache() {
  for (const resolvedId in cache) {
    try {
      fs.unlinkSync(path.join(CACHE_DIR, resolvedId));
      fs.unlinkSync(path.join(LOCAL_CACHE_DIR, resolvedId));
    } catch (err) {
      // ignore
    } finally {
      delete cache[resolvedId];
    }
  }
}

/**
 * Terminate workers
 */
function destroyWorkers() {
  return new Promise((resolve, reject) => {
    if (!workers) {
      return resolve();
    }

    workerFarm.end(workers, (msg) => {
      workers = undefined;
      if (msg) {
        return reject(Error(msg));
      }
      resolve();
    });
  });
}

function encodeId(id) {
  return id.replace(/\//g, '__');
}

function decodeId(id) {
  return id.replace(/__/g, '/');
}
