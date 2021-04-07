import { build as esBuild, transform as esTransform } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import bundle from './bundle.js';
import config from '../config.js';
import { isNodeModuleFilePath } from '../utils/is.js';
import { join } from 'path';
import { resolve } from '../resolver/index.js';
import transform from './transform.js';
import { warn } from '../utils/log.js';

const HOOK_NAMES = ['onDependencyBundle', 'onTransform', 'onResolveImport', 'onSend', 'onServerTransform'];

export default class Hooker {
  /**
   * Constructor
   *
   * @param { Hooks } [hooks]
   * @param { Watcher } [watcher]
   */
  constructor(hooks, watcher) {
    if (hooks) {
      for (const name of Object.keys(hooks)) {
        if (!HOOK_NAMES.includes(name)) {
          warn(`⚠️  no hook named "${name}". Valid hooks include: ${HOOK_NAMES.join(', ')}`);
        }
      }
    }

    /** @type { Hooks | undefined } */
    this.hooks = hooks;
    /** @type { Map<string, string> } */
    this.transformCache = new Map();
    this.watcher = watcher;

    /** @type { Array<import('esbuild').Plugin> } */
    this.serverBundlePlugins = [
      {
        name: 'bundle-server-project-files',
        setup(build) {
          build.onResolve({ filter: /.*/ }, function (args) {
            const { importer, path } = args;
            const filePath = importer ? resolve(path, importer) : path;
            const external = filePath === undefined || isNodeModuleFilePath(filePath);

            if (external) {
              return { path, external };
            }

            filePath && watcher && watcher.add(filePath);
            return { path: filePath };
          });

          build.onLoad({ filter: /^[./]/ }, async function (args) {
            try {
              if (hooks && hooks.onServerTransform) {
                let contents = readFileSync(args.path, 'utf8');
                const code = await hooks.onServerTransform(args.path, contents);

                if (code !== undefined) {
                  contents = code;
                }

                return { contents };
              }
            } catch (err) {
              return { errors: [{ text: err.message }] };
            }
          });
        },
      },
    ];
    /** @type { import('esbuild').BuildInvalidate } */
    this.serverBundleRebuild;

    // Patch build to watch files when used in transform hook,
    // since esbuild file reads don't use fs.readFile API
    if (watcher) {
      /** @type { import('esbuild').Plugin } */
      const resolvePlugin = {
        name: 'watch-project-files',
        setup(build) {
          build.onResolve({ filter: /^[./]/ }, function (args) {
            const { importer, path } = args;
            const filePath = importer ? resolve(path, importer) : path;

            if (filePath && !isNodeModuleFilePath(filePath)) {
              watcher && watcher.add(filePath);
            }

            return undefined;
          });
        },
      };
      this.patchedESBuild = new Proxy(esBuild, {
        apply(target, context, args) {
          if (!args[0].plugins) {
            args[0].plugins = [];
          }
          args[0].plugins.unshift(resolvePlugin);
          return Reflect.apply(target, context, args);
        },
      });
    } else {
      this.patchedESBuild = esBuild;
    }

    this.bundle = this.bundle.bind(this);
    this.transform = this.transform.bind(this);
    this.resolveImport = this.resolveImport.bind(this);
    this.send = this.send.bind(this);
    this.serverBundle = this.serverBundle.bind(this);
  }

  /**
   * Bundle node_modules cjs dependency and store at 'filePath'
   *
   * @param { string } filePath
   * @param { Res } res
   * @returns { Promise<void> }
   */
  async bundle(filePath, res) {
    await bundle(
      filePath,
      res,
      {
        build: esBuild,
      },
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
  async transform(filePath, lastChangedFilePath, res, clientPlatform) {
    await transform(
      filePath,
      lastChangedFilePath,
      res,
      clientPlatform,
      this.transformCache,
      {
        build: this.patchedESBuild,
        transform: esTransform,
      },
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
   * Bundle server content for 'filePath' entry
   *
   * @param { string } filePath
   * @returns { Promise<string> }
   */
  async serverBundle(filePath) {
    const { applicationFormat } = config;
    const outputPath = join(config.applicationDir, `app-${Date.now()}.${applicationFormat === 'cjs' ? 'cjs' : 'mjs'}`);

    const result = await (this.serverBundleRebuild
      ? this.serverBundleRebuild()
      : esBuild({
          banner: {
            js:
              applicationFormat === 'cjs'
                ? ''
                : "import { createRequire as createDvlpTopLevelRequire } from 'module'; \nconst require = createDvlpTopLevelRequire(import.meta.url);",
          },
          bundle: true,
          entryPoints: [filePath],
          format: applicationFormat,
          incremental: true,
          platform: 'node',
          plugins: this.serverBundlePlugins,
          sourcemap: true,
          target: `node${process.versions.node}`,
          write: false,
        }));

    if (!result.outputFiles) {
      throw Error(`unknown bundling error: ${result.warnings.join('\n')}`);
    }
    if (result.rebuild) {
      this.serverBundleRebuild = result.rebuild;
    }

    writeFileSync(outputPath, result.outputFiles[0].text, 'utf8');

    return outputPath;
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.serverBundleRebuild && this.serverBundleRebuild.dispose();
    this.transformCache.clear();
    this.watcher = undefined;
  }
}
