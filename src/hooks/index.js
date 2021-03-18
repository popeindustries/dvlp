'use strict';

const { build: esBuild, transform: esTransform, transformSync: esTransformSync } = require('esbuild');
const { extname, resolve: resolvePath } = require('path');
const bundle = require('./bundle.js');
const { isCjsFile } = require('../utils/file.js');
const { isNodeModuleFilePath } = require('../utils/is.js');
const { importModule } = require('../utils/module.js');
const { resolve } = require('../resolver/index.js');
const transform = require('./transform.js');
const { warn } = require('../utils/log.js');

const HOOK_NAMES = ['onDependencyBundle', 'onTransform', 'onResolveImport', 'onSend', 'onServerTransform'];

module.exports = class Hooker {
  /**
   * Constructor
   *
   * @param { string } [hooksPath]
   * @param { Watcher } [watcher]
   */
  constructor(hooksPath, watcher) {
    /** @type { Hooks | undefined } */
    this.hooks;

    if (hooksPath) {
      const hooks = importModule(hooksPath);

      for (const name of Object.keys(hooks)) {
        if (!HOOK_NAMES.includes(name)) {
          warn(`⚠️  no hook named "${name}". Valid hooks include: ${HOOK_NAMES.join(', ')}`);
        }
      }

      this.hooks = hooks;
    }

    /** @type { esbuild } */
    this.esbuild = {
      build: esBuild,
      transform: esTransform,
    };
    /** @type { Map<string, string> } */
    this.transformCache = new Map();
    this.watcher = watcher;

    this.bundle = this.bundle.bind(this);
    this.transform = this.transform.bind(this);
    this.resolveImport = this.resolveImport.bind(this);
    this.send = this.send.bind(this);
    this.serverTransform = this.serverTransform.bind(this);

    if (this.watcher) {
      const watcher = this.watcher;
      /** @type { import('esbuild').Plugin } */
      const watchPlugin = {
        name: 'watch-local',
        setup(build) {
          build.onResolve({ filter: /^[./]/ }, function (args) {
            const { importer, path, resolveDir } = args;
            const filePath = resolvePath(resolveDir, path);

            if (!isNodeModuleFilePath(filePath)) {
              const importPath = resolve(path, importer);

              if (importPath) {
                watcher.add(importPath);
              }
            }

            return undefined;
          });
        },
      };

      this.esbuild.build = new Proxy(this.esbuild.build, {
        apply(target, context, args) {
          if (!args[0].plugins) {
            args[0].plugins = [];
          }
          args[0].plugins.push(watchPlugin);
          return Reflect.apply(target, context, args);
        },
      });
    }
  }

  /**
   * Bundle node_modules cjs dependency and store at 'filePath'
   *
   * @param { string } filePath
   * @param { Res } res
   * @returns { Promise<void> }
   */
  async bundle(filePath, res) {
    await bundle(filePath, res, this.esbuild, this.hooks && this.hooks.onDependencyBundle);
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
  async transform(filePath, lastChangedFilePath, res, clientPlatform) {
    await transform(
      filePath,
      lastChangedFilePath,
      res,
      clientPlatform,
      this.transformCache,
      this.esbuild,
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
  resolveImport(specifier, context, defaultResolve) {
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
  send(filePath, fileContents) {
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
  serverTransform(filePath, fileContents) {
    let result;

    if (this.hooks && this.hooks.onServerTransform) {
      result = this.hooks.onServerTransform(filePath, fileContents);
    }
    if (result === undefined && !isCjsFile(filePath, fileContents)) {
      result = esTransformSync(fileContents, {
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
    this.transformCache.clear();
    this.watcher = undefined;
  }
};
