'use strict';

const { startService, transformSync } = require('esbuild');
const bundle = require('./bundle.js');
const { extname } = require('path');
const { importModule } = require('../utils/module.js');
const { isCjsFile } = require('../utils/is.js');
const transform = require('./transform.js');
const { warn } = require('../utils/log.js');

const HOOK_NAMES = [
  'onDependencyBundle',
  'onTransform',
  'onResolveImport',
  'onSend',
  'onServerTransform',
];

module.exports = class Hooker {
  /**
   * Constructor
   *
   * @param { string } [hooksPath]
   */
  constructor(hooksPath) {
    /** @type { Hooks | undefined } */
    this.hooks;

    if (hooksPath) {
      this.hooks = importModule(hooksPath);

      for (const name of Object.keys(module)) {
        if (!HOOK_NAMES.includes(name)) {
          warn(
            `⚠️  no hook named "${name}". Valid hooks include: ${HOOK_NAMES.join(
              ', ',
            )}`,
          );
        }
      }
    }

    /** @type { Map<string, string> } */
    this.transformCache = new Map();
    /** @type { import("esbuild").Service } */
    this.buildService;

    this.onDependencyBundle = this.onDependencyBundle.bind(this);
    this.onTransform = this.onTransform.bind(this);
    this.onResolveImport = this.onResolveImport.bind(this);
    this.onSend = this.onSend.bind(this);
    this.onServerTransform = this.onServerTransform.bind(this);
  }

  /**
   * Bundle node_modules cjs dependency and store at 'filePath'
   *
   * @param { string } filePath
   * @param { Res } res
   * @returns { Promise<void> }
   */
  async onDependencyBundle(filePath, res) {
    if (!this.buildService) {
      this.buildService = await startService();
    }

    await bundle(
      filePath,
      res,
      this.buildService,
      this.hooks && this.hooks.onDependencyBundle,
    );
  }

  /**
   * Transform file content for requested 'filePath'
   *
   * @param { string } filePath
   * @param { string } lastChangedFilePath
   * @param { Res } res
   * @param { TransformHookContext["client"] } clientPlatform
   * @returns { Promise<void> }
   */
  async onTransform(filePath, lastChangedFilePath, res, clientPlatform) {
    if (!this.buildService) {
      this.buildService = await startService();
    }

    await transform(
      filePath,
      lastChangedFilePath,
      res,
      clientPlatform,
      this.transformCache,
      this.buildService,
      this.hooks && this.hooks.onTransform,
    );
  }

  /**
   * Resolve module import 'specifier'
   *
   * @param { string } specifier
   * @param { ResolveHookContext } context
   * @param { DefaultResolve } defaultResolve
   * @returns { string | false | undefined}
   */
  onResolveImport(specifier, context, defaultResolve) {
    let result;

    if (this.hooks && this.hooks.onResolveImport) {
      result = this.hooks.onResolveImport(specifier, context, defaultResolve);
    }
    if (result === undefined) {
      result = defaultResolve(specifier, context.importer);
    }

    return result;
  }

  /**
   * Allow modification of 'filePath' content before sending the request
   *
   * @param { string } filePath
   * @param { string } fileContents
   * @returns { string }
   */
  onSend(filePath, fileContents) {
    let result;

    if (this.hooks && this.hooks.onSend) {
      result = this.hooks.onSend(filePath, fileContents);
    }

    return result || fileContents;
  }

  /**
   * Transform content for 'filePath' import
   *
   * @param { string } filePath
   * @param { string } fileContents
   * @returns { string }
   */
  onServerTransform(filePath, fileContents) {
    let result;

    if (this.hooks && this.hooks.onServerTransform) {
      result = this.hooks.onServerTransform(filePath, fileContents);
    }
    if (result === undefined && !isCjsFile(filePath, fileContents)) {
      result = transformSync(fileContents, {
        format: 'cjs',
        // @ts-ignore - supports all filetypes supported by node
        loader: extname(filePath).slice(1),
        sourcefile: filePath,
        target: `node${process.versions.node}`,
      }).code;
    }

    return result || fileContents;
  }

  /**
   * Destroy instance
   */
  destroy() {
    if (this.buildService) {
      this.buildService.stop();
    }
    this.transformCache.clear();
  }
};
