'use strict';

const { info, error } = require('../utils/log.js');
const {
  isJsFilePath,
  isNodeModuleFilePath,
  isPromise,
} = require('../utils/is.js');
const bundler = require('./bundle-worker.js');
const config = require('../config.js');
const chalk = require('chalk');
const debug = require('debug')('dvlp:module');
const fs = require('fs');
const { getCachedPackage } = require('../resolver/index.js');
const path = require('path');
const { resolve } = require('../resolver/index.js');
const workerFarm = require('worker-farm');

const SOURCE_PREFIX = '// source: ';
const RE_SOURCE_PATH = /^\/\/ source: (.+)/;

/** @type { Map<string, true | Promise<string>> } */
const cache = new Map();
/** @type { import('worker-farm').Workers | undefined } */
let workers;

if (config.maxModuleBundlerWorkers) {
  debug(`bundling modules with ${config.maxModuleBundlerWorkers} workers`);
}

if (fs.existsSync(config.bundleDir)) {
  const names = new Map();

  fs.readdirSync(config.bundleDir)
    .filter(isJsFilePath)
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
  parseOriginalSourcePath,
  resolveModuleId,
  resolveModulePath,
};

/**
 * Resolve module id into cacheable id
 *
 * @param { string } id
 * @param { string } filePath
 * @returns { string }
 */
function resolveModuleId(id, filePath) {
  if (!isNodeModuleFilePath(filePath)) {
    return '';
  }

  const pkg = getCachedPackage(path.dirname(filePath));

  return `${encodeId(id)}-${pkg.version}.js`;
}

/**
 * Retrieve path to cached 'resolvedId'
 *
 * @param { string } resolvedId
 * @returns { string }
 */
function resolveModulePath(resolvedId) {
  return path.join(config.bundleDir, resolvedId);
}

/**
 * Retrieve original source path from bundled source code
 *
 * @param { string } code
 * @returns { string }
 */
function parseOriginalSourcePath(code) {
  const match = RE_SOURCE_PATH.exec(code);

  return match && match[1] ? match[1] : '';
}

/**
 * Trigger bundle of 'resolvedId'
 *
 * @param { Res } res
 * @param { string } resolvedId
 * @param { import("rollup").RollupOptions } rollupConfig
 * @param { string } [originalId]
 * @param { string } [inputPath]
 * @returns { true | Promise<string> | undefined }
 */
function bundle(res, resolvedId, rollupConfig, originalId, inputPath) {
  if (!resolvedId) {
    return;
  }
  if (!originalId) {
    originalId = decodeId(resolvedId.slice(0, resolvedId.lastIndexOf('-')));
  }
  if (!inputPath) {
    inputPath = resolve(originalId);
  }

  const outputPath = resolveModulePath(resolvedId);
  const cached = cache.get(resolvedId);

  if (!cached) {
    return doBundle(
      res,
      resolvedId,
      originalId,
      // @ts-ignore
      inputPath,
      outputPath,
      rollupConfig,
    );
  }

  return isPromise(cached) ? cached : Promise.resolve(outputPath);
}

/**
 * Bundle module at 'oringinalId'
 *
 * @param { Res } res
 * @param { string } resolvedId
 * @param { string } oringinalId
 * @param { string } inputPath
 * @param { string } outputPath
 * @param { import("rollup").RollupOptions } rollupConfig
 * @returns { Promise<string> }
 */
function doBundle(
  res,
  resolvedId,
  oringinalId,
  inputPath,
  outputPath,
  rollupConfig,
) {
  res.metrics.recordEvent('bundle JS file');

  const promiseToCache = new Promise(async (resolve, reject) => {
    getBundler()(inputPath, outputPath, SOURCE_PREFIX, rollupConfig, (err) => {
      if (err) {
        error(`unable to bundle ${oringinalId}`);
        cache.delete(resolvedId);
        return reject(err);
      }

      cache.set(resolvedId, true);
      resolve(outputPath);
      res.metrics.recordEvent('bundle JE file');

      // Can't use file.getProjectPath() here because of circular dependency
      info(
        `bundled ${chalk.green(oringinalId)} as ${chalk.green(
          path.relative(process.cwd(), outputPath),
        )}`,
      );
    });
  });

  cache.set(resolvedId, promiseToCache);
  return promiseToCache;
}

/**
 * Retrieve bundler.
 * Starts workers if config.maxModuleBundlerWorkers > 0,
 * otherwise uses bundler directly
 *
 * @returns { BundleWorker }
 */
function getBundler() {
  if (!config.maxModuleBundlerWorkers) {
    return bundler;
  }

  if (!workers) {
    workers = workerFarm(
      { maxConcurrentWorkers: config.maxModuleBundlerWorkers },
      path.resolve(__dirname, './bundle-worker.js'),
    );
    debug(`spawned ${config.maxModuleBundlerWorkers} bundler workers`);
  }

  return workers;
}

/**
 * Clear memory and disk cache
 */
function cleanBundles() {
  for (const resolvedId of cache.keys()) {
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

    workerFarm.end(workers, (/** @type { string } */ msg) => {
      workers = undefined;
      if (msg) {
        return reject(Error(msg));
      }
      resolve();
    });
  });
}

/**
 * Encode "id"
 *
 * @param { string } id
 */
function encodeId(id) {
  return id.replace(/\//g, '__');
}

/**
 * Decode "id"
 *
 * @param { string } id
 */
function decodeId(id) {
  return id.replace(/__/g, '/');
}
