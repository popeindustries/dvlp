'use strict';

const { info, error } = require('./log');
const { isJsFilepath, isNodeModuleFilepath } = require('./is');
const config = require('../config');
const bundler = require('./moduleBundlerWorker');
const chalk = require('chalk');
const debug = require('debug')('dvlp:module');
const fs = require('fs');
const path = require('path');
const readPkg = require('read-pkg-up');
const rimraf = require('rimraf');
const stopwatch = require('./stopwatch');
const workerFarm = require('worker-farm');

let workers;

if (config.maxModuleBundlerWorkers) {
  debug(`bundling modules with ${config.maxModuleBundlerWorkers} workers`);
}
if (!fs.existsSync(config.moduleCacheDir)) {
  fs.mkdirSync(config.moduleCacheDir);
}

process.on('exit', () => {
  if (config.testing) {
    rimraf.sync(config.moduleCacheDir);
  }
});

const cache = fs
  .readdirSync(config.moduleCacheDir)
  .filter(isJsFilepath)
  .reduce((cache, resolvedId) => {
    cache[resolvedId] = true;
    return cache;
  }, {});

module.exports = {
  bundle,
  cleanCache,
  destroyWorkers,
  resolveModuleId,
  resolveModulePath
};

/**
 * Resolve module id into cacheable id
 * @param {string} id
 * @returns {string}
 */
function resolveModuleId(id) {
  try {
    const main = require.resolve(id);
    if (!isNodeModuleFilepath(main)) {
      return '';
    }
    const { pkg } = readPkg.sync({ cwd: path.dirname(main) });
    return `${encodeId(id)}-${pkg.version}.js`;
  } catch (err) {
    error(`unable to resolve path for ${id} module`);
    return '';
  }
}

/**
 * Retrieve path to cached 'resolvedId'
 * @param {string} resolvedId
 * @returns {string}
 */
function resolveModulePath(resolvedId) {
  return path.join(config.moduleCacheDir, resolvedId);
}

/**
 * Trigger bundle of 'id'.
 * Returns Promise if bundling already in progress.
 * @param {string} [id]
 * @param {string} [resolvedId]
 * @param {object} [rollupConfig]
 * @returns {Promise<string>}
 */
function bundle(id, resolvedId = resolveModuleId(id), rollupConfig) {
  if (!resolvedId) {
    return null;
  }
  if (!id) {
    id = decodeId(resolvedId.slice(0, resolvedId.indexOf('-')));
  }

  const filepath = resolveModulePath(resolvedId);

  if (!(resolvedId in cache)) {
    return doBundle(id, resolvedId, filepath, rollupConfig);
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
 * @param {object} [rollupConfig]
 * @returns {Promise<string>}
 */
function doBundle(id, resolvedId, filepath, rollupConfig) {
  return (cache[resolvedId] = new Promise(async (resolve, reject) => {
    stopwatch.start(id);

    getBundler()(id, filepath, rollupConfig, (err) => {
      if (err) {
        error(`unable to bundle ${id}`);
        delete cache[resolvedId];
        return reject(err);
      }

      // Can't use file.getProjectPath() here because of circular dependency
      info(
        `${stopwatch.stop(id, true, true)} bundled ${chalk.green(id)} as ${chalk.green(
          path.relative(process.cwd(), filepath)
        )}`
      );
      cache[resolvedId] = true;
      resolve(filepath);
    });
  }));
}

/**
 * Retrieve bundler.
 * Starts workers if config.maxModuleBundlerWorkers > 0,
 * otherwise uses bundler directly
 * @returns {(string, string, string, string, (Error) => void) => void}
 */
function getBundler() {
  if (!config.maxModuleBundlerWorkers) {
    return bundler;
  }

  if (!workers) {
    workers = workerFarm(
      { maxConcurrentWorkers: config.maxModuleBundlerWorkers },
      require.resolve('./moduleBundlerWorker.js')
    );
    debug(`spawned ${config.maxModuleBundlerWorkers} bundler workers`);
  }

  return workers;
}

/**
 * Clear memory and disk cache
 */
function cleanCache() {
  for (const resolvedId in cache) {
    try {
      fs.unlinkSync(resolveModulePath(resolvedId));
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
