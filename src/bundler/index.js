'use strict';

const {
  isJsFilePath,
  isNodeModuleFilePath,
  isPromise,
} = require('../utils/is.js');
const BundleWorker = require('./bundle-worker.js');
const config = require('../config.js');
const { cpus } = require('os');
const debug = require('debug')('dvlp:module');
const { error } = require('../utils/log.js');
const fs = require('fs');
const { getCachedPackage } = require('../resolver/index.js');
const path = require('path');
const { resolve } = require('../resolver/index.js');

const SOURCE_PREFIX = '// source: ';
const RE_SOURCE_PATH = /^\/\/ source: (.+)/;

/** @type { Map<string, string | Promise<string>> } */
const cache = new Map();
/** @type { Array<BundleWorker> } */
let bundleWorkers = [];
let bundleWorkersIndex = 0;
let threads = 1;

try {
  threads = Math.max(cpus().length - 1, 1);
} catch (err) {
  // ignore
}

if (fs.existsSync(config.bundleDir)) {
  const names = new Map();

  fs.readdirSync(config.bundleDir)
    .filter(isJsFilePath)
    .forEach((resolvedId) => {
      const name = resolvedId.slice(0, resolvedId.lastIndexOf('-'));

      if (!names.has(name)) {
        cache.set(resolvedId, path.join(config.bundleDir, resolvedId));
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
 * @param { string } resolvedId
 * @param { string } [rollupConfigPath]
 * @param { string } [originalId]
 * @param { string } [inputPath]
 * @returns { true | Promise<string> | undefined }
 */
function bundle(resolvedId, rollupConfigPath, originalId, inputPath) {
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
      resolvedId,
      originalId,
      // @ts-ignore
      inputPath,
      outputPath,
      rollupConfigPath,
      config.brokenNamedExportsPackages[originalId],
    );
  }

  return isPromise(cached) ? cached : Promise.resolve(outputPath);
}

/**
 * Bundle module at 'oringinalId'
 *
 * @param { string } resolvedId
 * @param { string } oringinalId
 * @param { string } inputPath
 * @param { string } outputPath
 * @param { string } [rollupConfigPath]
 * @param { Array<string> | undefined } [namedExports]
 * @returns { Promise<string> }
 */
function doBundle(
  resolvedId,
  oringinalId,
  inputPath,
  outputPath,
  rollupConfigPath,
  namedExports,
) {
  const pendingBundle = getWorkerInstance(rollupConfigPath)
    .bundle(inputPath, outputPath, SOURCE_PREFIX, namedExports)
    .then(() => {
      cache.set(resolvedId, outputPath);
      return outputPath;
    })
    .catch((err) => {
      error(`unable to bundle ${oringinalId}`);
      cache.delete(resolvedId);
      return outputPath;
    });

  cache.set(resolvedId, pendingBundle);
  return pendingBundle;
}

/**
 * Retrieve bundler.
 * Starts workers if config.maxModuleBundlerWorkers > 0,
 * otherwise uses bundler directly
 *
 * @param { string | undefined } rollupConfigPath
 * @returns { BundleWorker }
 */
function getWorkerInstance(rollupConfigPath) {
  if (!bundleWorkers.length) {
    for (let i = 0; i < threads; i++) {
      bundleWorkers.push(new BundleWorker(rollupConfigPath));
    }
    debug(`spawned ${threads} bundler workers`);
  }

  // Round robin
  return bundleWorkers[bundleWorkersIndex++ % threads];
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
 *
 * @returns { Promise<void> }
 */
function destroyWorkers() {
  return Promise.all(
    bundleWorkers.map((bundleWorker) => bundleWorker.destroy()),
  )
    .then(() => {
      bundleWorkers = [];
    })
    .catch((err) => {
      console.error(err);
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
