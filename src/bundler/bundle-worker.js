'use strict';

/** @typedef { import("rollup").RollupOptions } RollupOptions */

const {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} = require('worker_threads');
const {
  getDefaultRollupConfig,
} = require('../bundler/default-rollup-config.js');
const { importModule } = require('../utils/module.js');
const { rollup } = require('rollup');

class BundleWorker {
  /**
   * Constructor
   *
   * @param { boolean } threaded
   * @param { string } [rollupConfigPath]
   */
  constructor(threaded, rollupConfigPath) {
    const defaultConfig = getDefaultRollupConfig();

    this.rollupConfig = rollupConfigPath
      ? mergeRollupConfig(defaultConfig, importModule(rollupConfigPath))
      : defaultConfig;
    this.worker;

    if (threaded && isMainThread) {
      // Load this file in Worker thread, passing `rollupConfigPath` as data
      this.worker = new Worker(__filename, { workerData: rollupConfigPath });
    }
  }

  /**
   * Bundle file at "inputPath"
   *
   * @param { string } inputPath
   * @param { string } outputPath
   * @param { string } sourcePrefix
   */
  async bundle(inputPath, outputPath, sourcePrefix) {
    if (this.worker) {
      return new Promise((resolve, reject) => {
        this.worker.postMessage({ inputPath, outputPath, sourcePrefix });
        this.worker.once('message', (err) => {
          err ? reject(err) : resolve();
        });
      });
    }

    const parsedOptions = parseRollupOptions(
      sourcePrefix + inputPath,
      this.rollupConfig,
    );
    const inputOptions = {
      ...parsedOptions.input,
      input: inputPath,
    };
    const outputOptions = {
      ...parsedOptions.output,
      file: outputPath,
    };

    const bundled = await rollup(inputOptions);
    await bundled.write(outputOptions);
  }

  /**
   * Destroy instance
   *
   * @returns { Promise<void> }
   */
  destroy() {
    if (this.worker) {
      // @ts-ignore
      return this.worker.terminate();
    }
    return Promise.resolve();
  }
}

module.exports = BundleWorker;

// Create instance if run in Worker thread
if (!isMainThread && parentPort) {
  /** @type { string | undefined } */
  const rollupConfigPath = workerData;
  const bundleWorker = new BundleWorker(false, rollupConfigPath);

  parentPort.on('message', async (
    /** @type { BundleWorkerMessage } */ message,
  ) => {
    const { inputPath, outputPath, sourcePrefix } = message;

    try {
      await bundleWorker.bundle(inputPath, outputPath, sourcePrefix);
      parentPort.postMessage(false);
    } catch (err) {
      parentPort.postMessage(err);
    }
  });
}

/**
 * Merge user rollup-config with default
 *
 * @param { RollupOptions } defaultConfig
 * @param { RollupOptions } newConfig
 * @returns { RollupOptions }
 */
function mergeRollupConfig(defaultConfig, newConfig) {
  const {
    output: requiredOutput,
    plugins: defaultPlugins = [],
    ...defaultOptions
  } = defaultConfig;
  const { output, plugins = [], ...options } = newConfig;
  /** @type { { [name: string]: import('rollup').Plugin }}  */
  const newPluginsByName = plugins.reduce((newPluginsByName, plugin) => {
    // @ts-ignore
    newPluginsByName[plugin.name] = plugin;
    return newPluginsByName;
  }, {});
  let mergedPlugins = [];

  // Replace default plugin with new if it has the same name
  for (const plugin of defaultPlugins) {
    const { name } = plugin;
    mergedPlugins.push(
      name in newPluginsByName ? newPluginsByName[name] : plugin,
    );
  }

  return {
    ...defaultOptions,
    ...options,
    plugins: mergedPlugins,
    output: { ...output, ...requiredOutput },
  };
}

/**
 * Parse Rollup options
 *
 * @param { string } banner
 * @param { RollupOptions } options
 * @returns { { input: object, output: object } }
 */
function parseRollupOptions(banner, options) {
  if (!options) {
    return { input: {}, output: { banner } };
  }

  const { input, treeshake, output = {}, watch, ...inputOverride } = options;
  // @ts-ignore
  const { file, format, sourcemap, ...outputOverride } = output;

  if ('banner' in outputOverride) {
    outputOverride.banner = banner + outputOverride.banner;
  } else {
    // @ts-ignore
    outputOverride.banner = banner;
  }

  return { input: inputOverride, output: outputOverride };
}
