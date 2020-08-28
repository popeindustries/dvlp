'use strict';

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
// @ts-ignore
const virtual = require('@rollup/plugin-virtual');

class BundleWorker {
  /**
   * Constructor
   *
   * @param { string } [rollupConfigPath]
   */
  constructor(rollupConfigPath) {
    const defaultConfig = getDefaultRollupConfig();

    this.rollupConfig = rollupConfigPath
      ? mergeRollupConfig(defaultConfig, importModule(rollupConfigPath))
      : defaultConfig;
    this.worker;

    if (isMainThread) {
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
   * @param { Array<string> } [namedExports]
   */
  async bundle(inputPath, outputPath, sourcePrefix, namedExports) {
    if (this.worker) {
      return new Promise((resolve, reject) => {
        if (this.worker) {
          this.worker.postMessage({
            inputPath,
            outputPath,
            sourcePrefix,
            namedExports,
          });
          this.worker.once('message', (err) => {
            err ? reject(err) : resolve();
          });
        } else {
          reject(Error('No bundle worker instance found'));
        }
      });
    }

    const banner = sourcePrefix + inputPath;
    const parsedOptions = parseRollupOptions(banner, this.rollupConfig);
    const inputOptions = {
      ...parsedOptions.input,
      input: inputPath,
    };
    const outputOptions = {
      ...parsedOptions.output,
      file: outputPath,
    };

    if (namedExports && inputOptions.plugins) {
      inputOptions.plugins.unshift(
        virtual({
          entry: `import entry from '${inputPath}';
        export default entry;
        export {${namedExports.join(', ')}} from '${inputPath}';`,
        }),
      );
      inputOptions.input = 'entry';
    }

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
  const bundleWorker = new BundleWorker(rollupConfigPath);

  parentPort.on('message', async (
    /** @type { BundleWorkerMessage } */ message,
  ) => {
    const { inputPath, outputPath, sourcePrefix, namedExports } = message;

    try {
      await bundleWorker.bundle(
        inputPath,
        outputPath,
        sourcePrefix,
        namedExports,
      );
      parentPort.postMessage(false);
    } catch (err) {
      parentPort.postMessage(err);
    }
  });
}

/**
 * Merge user rollup.config with default
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
 * @returns { { input: RollupInputOptions, output: RollupOutputOptions } }
 */
function parseRollupOptions(banner, options) {
  if (!options) {
    return { input: {}, output: { banner } };
  }

  let { input, treeshake, output = {}, watch, ...inputOverride } = options;

  if (Array.isArray(output)) {
    output = output[0];
  }

  const { file, format, sourcemap, ...outputOverride } = output;

  if ('banner' in outputOverride) {
    outputOverride.banner = banner + outputOverride.banner;
  } else {
    outputOverride.banner = banner;
  }

  // Shallow copy plugins
  if (inputOverride.plugins) {
    inputOverride.plugins = [...inputOverride.plugins];
  }

  return { input: inputOverride, output: outputOverride };
}
