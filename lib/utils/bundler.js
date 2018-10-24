'use strict';

const { info, error } = require('./log');
const { isJsFilepath, isNodeModuleFilepath, isProxy } = require('./is');
const config = require('../config');
const bundler = require('./bundlerWorker');
const chalk = require('chalk');
const debug = require('debug')('dvlp:module');
const fs = require('fs');
const path = require('path');
const readPkg = require('read-pkg-up');
const resolveFrom = require('resolve-from');
const stopwatch = require('./stopwatch');
const workerFarm = require('worker-farm');

const cache = new Map();
let workers;

if (config.maxModuleBundlerWorkers) {
  debug(`bundling modules with ${config.maxModuleBundlerWorkers} workers`);
}

if (fs.existsSync(config.bundleDir)) {
  const names = new Map();

  fs.readdirSync(config.bundleDir)
    .filter(isJsFilepath)
    .forEach((resolvedId) => {
      const name = resolvedId.slice(0, resolvedId.lastIndexOf('-'));

      if (!names.has(name)) {
        cache.set(resolvedId, true);
        names.set(name, resolvedId);
      } else {
        // Clear instances if duplicates with different versions
        const existing = names.get(name);

        cache.delete(existing);
        fs.unlinkSync(path.resolve(config.bundleDir, existing));
        fs.unlinkSync(path.resolve(config.bundleDir, resolvedId));
      }
    });
}

module.exports = {
  bundle,
  cleanBundles,
  destroyWorkers,
  resolveModuleId,
  resolveModulePath
};

/**
 * Resolve module id into cacheable id
 * @param {string} id
 * @param {string} [dir]
 * @returns {string}
 */
function resolveModuleId(id, dir = process.cwd()) {
  try {
    // Throws
    const main = resolveFrom(dir, id);

    if (!isNodeModuleFilepath(main)) {
      return '';
    }

    const { pkg } = readPkg.sync({ cwd: path.dirname(main) });

    return `${encodeId(id)}-${pkg.version}.js`;
  } catch (err) {
    error(`unable to resolve path for "${id}" module`);
    return '';
  }
}

/**
 * Retrieve path to cached 'resolvedId'
 * @param {string} resolvedId
 * @returns {string}
 */
function resolveModulePath(resolvedId) {
  return path.join(config.bundleDir, resolvedId);
}

/**
 * Trigger bundle of 'id'.
 * Returns Promise if bundling already in progress.
 * @param {string} resolvedId
 * @param {string} [id]
 * @param {object} [rollupConfig]
 * @returns {Promise<string>}
 */
function bundle(resolvedId, id, rollupConfig) {
  if (!resolvedId) {
    return null;
  }
  if (!id) {
    id = decodeId(resolvedId.slice(0, resolvedId.lastIndexOf('-')));
  }
  const filepath = resolveModulePath(resolvedId);

  if (!cache.has(resolvedId)) {
    return doBundle(id, resolvedId, filepath, rollupConfig);
  } else if (isProxy(cache.get(resolvedId))) {
    return cache.get(resolvedId);
  } else {
    return Promise.resolve(filepath);
  }
}

/**
 * Bundle module at 'id'
 * @param {string} id
 * @param {string} resolvedId
 * @param {string} filepath
 * @param {object} [rollupConfig]
 * @returns {Promise<string>}
 */
function doBundle(id, resolvedId, filepath, rollupConfig) {
  const promiseToCache = new Promise(async (resolve, reject) => {
    stopwatch.start(id);

    getBundler()(id, filepath, rollupConfig, (err) => {
      if (err) {
        error(`unable to bundle ${id}`);
        cache.delete(resolvedId);
        return reject(err);
      }

      // Can't use file.getProjectPath() here because of circular dependency
      info(
        `${stopwatch.stop(id, true, true)} bundled ${chalk.green(id)} as ${chalk.green(
          path.relative(process.cwd(), filepath)
        )}`
      );
      cache.set(resolvedId, true);
      resolve(filepath);
    });
  });

  cache.set(resolvedId, promiseToCache);
  return promiseToCache;
}

/**
 * Retrieve bundler.
 * Starts workers if config.maxModuleBundlerWorkers > 0,
 * otherwise uses bundler directly
 * @returns {(string, string, object, (Error) => void) => void}
 */
function getBundler() {
  if (!config.maxModuleBundlerWorkers) {
    return bundler;
  }

  if (!workers) {
    workers = workerFarm(
      { maxConcurrentWorkers: config.maxModuleBundlerWorkers },
      require.resolve('./bundlerWorker.js')
    );
    debug(`spawned ${config.maxModuleBundlerWorkers} bundler workers`);
  }

  return workers;
}

/**
 * Clear memory and disk cache
 */
function cleanBundles() {
  for (const resolvedId of cache) {
    try {
      fs.unlinkSync(resolveModulePath(resolvedId));
    } catch (err) {
      // ignore
    } finally {
      cache.delete(resolvedId);
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
