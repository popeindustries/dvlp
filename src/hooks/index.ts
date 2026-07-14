import type {
  DefaultResolve,
  Hooks,
  ResolveHookContext,
  TransformHookContext,
} from './types.ts';
import { error, noisyWarn } from '../utils/log.ts';
import type { Req, Res } from '../types.ts';
import { bundleDependency } from './bundle-dependency.ts';
import chalk from 'chalk';
import esbuild from 'esbuild';
import { isNodeModuleFilePath } from '../utils/is.ts';
import type { Plugin } from 'esbuild';
import { resolve } from '../resolver/index.ts';
import { transform } from './transform.ts';
import type { Watcher } from '../utils/types.ts';

const HOOK_NAMES = [
  'onDependencyBundle',
  'onTransform',
  'onResolveImport',
  'onRequest',
  'onSend',
  'onServerResolve',
  'onServerTransform',
];

export class Hooker {
  defaultTransformer: 'esbuild' | 'amaro';
  hooks: Hooks | undefined;
  transformCache: Map<string, string>;
  watcher: Watcher | undefined;
  patchedESBuild: typeof esbuild.build;

  /**
   * Constructor
   */
  constructor(
    defaultTransformer: 'esbuild' | 'amaro' = 'esbuild',
    hooks?: Hooks,
    watcher?: Watcher,
  ) {
    if (hooks) {
      for (const name of Object.keys(hooks)) {
        if (!HOOK_NAMES.includes(name) && name !== 'filePath') {
          noisyWarn(
            `${chalk.yellow(
              '⚠️',
            )}  no hook named "${name}". Valid hooks include: ${HOOK_NAMES.join(
              ', ',
            )}`,
          );
        }
      }
    }

    this.defaultTransformer = defaultTransformer;
    this.hooks = hooks;
    this.transformCache = new Map();
    this.watcher = watcher;

    // Patch build to watch files when used in transform hook,
    // since esbuild file reads don't use fs.readFile API
    if (watcher) {
      const resolvePlugin: Plugin = {
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
   */
  async bundleDependency(filePath: string, res: Res): Promise<void> {
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
   */
  async transform(
    filePath: string,
    lastChangedFilePath: string,
    res: Res,
    clientPlatform: TransformHookContext['client'],
  ): Promise<void> {
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
      this.defaultTransformer,
      this.hooks && this.hooks.onTransform,
    );
  }

  /**
   * Resolve module import 'specifier'
   */
  resolveImport(
    specifier: string,
    context: ResolveHookContext,
    defaultResolve: DefaultResolve,
  ): string | false | undefined {
    let result: string | false | undefined;

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
   */
  async handleRequest(req: Req, res: Res): Promise<boolean> {
    if (this.hooks && this.hooks.onRequest) {
      try {
        // Check if finished in case no return value
        if ((await this.hooks.onRequest(req, res)) || res.finished) {
          return true;
        }
      } catch (err) {
        res.writeHead(500);
        res.end((err as Error).message);
        error(err);
        return true;
      }
    }

    return false;
  }

  /**
   * Allow modification of 'filePath' content before sending the request
   */
  send(filePath: string, fileContents: string): string {
    let result: string | undefined;

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
