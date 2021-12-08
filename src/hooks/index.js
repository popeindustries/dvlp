import { error, noisyWarn } from '../utils/log.js';
import bundleDependency from './bundle-dependency.js';
import esbuild from 'esbuild';
import { isNodeModuleFilePath } from '../utils/is.js';
import { resolve } from '../resolver/index.js';
import transform from './transform.js';

const HOOK_NAMES = [
  'onDependencyBundle',
  'onTransform',
  'onResolveImport',
  'onRequest',
  'onSend',
  'onServerResolve',
  'onServerTransform',
];

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
        if (!HOOK_NAMES.includes(name) && name !== 'filePath') {
          noisyWarn(`⚠️  no hook named "${name}". Valid hooks include: ${HOOK_NAMES.join(', ')}`);
        }
      }
    }

    /** @type { Hooks | undefined } */
    this.hooks = hooks;
    /** @type { Map<string, string> } */
    this.transformCache = new Map();
    this.watcher = watcher;

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
      this.patchedESBuild = new Proxy(esbuild.build, {
        apply(target, context, args) {
          if (!args[0].plugins) {
            args[0].plugins = [];
          }
          args[0].plugins.unshift(resolvePlugin);
          return Reflect.apply(target, context, args);
        },
      });
    } else {
      this.patchedESBuild = esbuild.build;
    }

    this.bundleDependency = this.bundleDependency.bind(this);
    this.transform = this.transform.bind(this);
    this.resolveImport = this.resolveImport.bind(this);
    this.send = this.send.bind(this);
  }

  /**
   * Bundle node_modules cjs dependency and store at 'filePath'
   *
   * @param { string } filePath
   * @param { Res } res
   * @returns { Promise<void> }
   */
  async bundleDependency(filePath, res) {
    await bundleDependency(
      filePath,
      res,
      {
        build: esbuild.build,
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
        transform: esbuild.transform,
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
   * Allow external response handling
   *
   * @param { Req } req
   * @param { Res } res
   * @returns { Promise<boolean> }
   */
  async handleRequest(req, res) {
    if (this.hooks && this.hooks.onRequest) {
      try {
        // Check if finished in case no return value
        if ((await this.hooks.onRequest(req, res)) || res.finished) {
          return true;
        }
      } catch (err) {
        res.writeHead(500);
        res.end(/** @type { Error } */ (err).message);
        error(err);
        return true;
      }
    }

    return false;
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
   * Destroy instance
   */
  destroy() {
    this.transformCache.clear();
    this.watcher = undefined;
  }
}
