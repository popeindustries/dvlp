import { build as esBuild, transform as esTransform } from 'esbuild';
import bundle from './bundle.js';
import config from '../config.js';
import { isNodeModuleFilePath } from '../utils/is.js';
import { join } from 'path';
import { readFileSync } from 'fs';
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

    /** @type { esbuild } */
    this.esbuild = {
      build: esBuild,
      transform: esTransform,
    };
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
            const filePath = resolve(path, importer);
            const external = filePath === undefined || isNodeModuleFilePath(filePath);

            if (external) {
              return { path, external };
            }
            return { path: filePath, namespace: 'project-file' };
          });
          build.onLoad({ filter: /^[./]/, namespace: 'project-file' }, async function (args) {
            try {
              let contents = readFileSync(args.path, 'utf8');
              if (hooks && hooks.onServerTransform) {
                const code = await hooks.onServerTransform(args.path, contents);
                if (code !== undefined) {
                  contents = code;
                }
              }
              return { contents };
            } catch (err) {
              return { errors: [{ text: err.message }] };
            }
          });
        },
      },
    ];

    // Patch build to watch files when used in transform hook,
    // since esbuild file reads don't use fs.readFile API
    if (watcher) {
      /** @type { import('esbuild').Plugin } */
      const resolvePlugin = {
        name: 'watch-project-files',
        setup(build) {
          build.onResolve({ filter: /^[./]/ }, function (args) {
            const { importer, path } = args;
            const filePath = resolve(path, importer);

            if (filePath && !isNodeModuleFilePath(filePath)) {
              watcher && watcher.add(filePath);
            }

            return {
              path: filePath || path,
            };
          });
        },
      };
      this.esbuild.build = new Proxy(this.esbuild.build, {
        apply(target, context, args) {
          if (!args[0].plugins) {
            args[0].plugins = [];
          }
          args[0].plugins.unshift(resolvePlugin);
          return Reflect.apply(target, context, args);
        },
      });
    }

    this.bundle = this.bundle.bind(this);
    this.transform = this.transform.bind(this);
    this.resolveImport = this.resolveImport.bind(this);
    this.send = this.send.bind(this);
    this.serverBundle = this.serverBundle.bind(this);
    this.serverTransform = this.serverTransform.bind(this);
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
   * Bundle server content for 'filePath' entry
   *
   * @param { string } filePath
   * @returns { Promise<string> }
   */
  async serverBundle(filePath) {
    const { format } = config;
    const outputPath = join(config.applicationDir, `app-${Date.now()}.${format === 'cjs' ? 'cjs' : 'mjs'}`);

    // TODO: incremental: true, write: false, sourcemap: 'inline'
    await esBuild({
      banner: {
        js:
          format === 'cjs'
            ? ''
            : "import { createRequire as createDvlpTopLevelRequire } from 'module'; \nconst require = createDvlpTopLevelRequire(import.meta.url);",
      },
      bundle: true,
      stdin: {
        contents: `import '${filePath}';`,
        resolveDir: process.cwd(),
      },
      format,
      outfile: outputPath,
      platform: 'node',
      plugins: this.serverBundlePlugins,
      target: `node${process.versions.node}`,
    });

    return outputPath;
  }

  /**
   * Transform server content for 'filePath' import
   *
   * @param { string } filePath
   * @param { string } fileContents
   * @returns { Promise<string> }
   */
  async serverTransform(filePath, fileContents) {
    let result;

    if (this.hooks && this.hooks.onServerTransform) {
      result = await this.hooks.onServerTransform(filePath, fileContents);
    }
    // if (result === undefined && !isCjsFile(filePath, fileContents)) {
    //   result = esTransformSync(fileContents, {
    //     format: 'cjs',
    //     // @ts-ignore - supports all filetypes supported by node
    //     loader: extname(filePath).slice(1),
    //     sourcefile: filePath,
    //     target: `node${process.versions.node}`,
    //   }).code;
    // }

    return result || fileContents;
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.transformCache.clear();
    this.watcher = undefined;
  }
}
