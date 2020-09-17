'use strict';

const { error, warn } = require('./log.js');
const { getProjectPath, getTypeFromPath } = require('./file.js');
const debug = require('debug')('dvlp:hooks');
const { importModule } = require('./module.js');
const Metrics = require('./metrics.js');
const mime = require('mime');
const { readFileSync } = require('fs');

const RE_TRANSPILER_HANDLES_SERVER = /\(\s?[a-zA-Z]+,\s?[a-zA-Z]+\s?\)/;
const HOOK_NAMES = [
  'onTransform',
  'onServerTransform',
  'onResolveImport',
  'onSend',
];

module.exports = class Hooker {
  /**
   * Constructor
   *
   * @param { string } [hooksPath]
   * @param { string } [transpilerPath]
   */
  constructor(hooksPath, transpilerPath) {
    if (hooksPath) {
      /** @type { Hooks } */
      const module = importModule(hooksPath);

      if (module.onTransform) {
        this._onTransform = module.onTransform;
      }
      if (module.onResolveImport) {
        this._onResolveImport = module.onResolveImport;
      }
      if (module.onSend) {
        this._onSend = module.onSend;
      }
      if (module.onServerTransform) {
        this._onServerTransform = module.onServerTransform;
      }

      for (const name of Object.keys(module)) {
        if (!HOOK_NAMES.includes(name)) {
          warn(
            `⚠️  no hook named "${name}". Valid hooks include: ${HOOK_NAMES.join(
              ', ',
            )}`,
          );
        }
      }
    } else if (transpilerPath) {
      // Create backwards compatible hook from transpiler.

      /** @type { Transpiler } */
      const transpiler = importModule(transpilerPath);
      const hasServerTranspiler = RE_TRANSPILER_HANDLES_SERVER.test(
        transpiler.toString(),
      );

      /**
       * @param { string } filePath
       * @param { string } fileContents
       */
      this._onTransform = function onTransform(filePath, fileContents) {
        return transpiler(filePath, false);
      };

      if (hasServerTranspiler) {
        /**
         * @param { string } filePath
         * @param { string } fileContents
         */
        this._onTransformServer = function onTransformServer(
          filePath,
          fileContents,
        ) {
          return transpiler(filePath, true);
        };
      }
    }

    /** @type { Map<string, string> } */
    this.transformCache = new Map();
    this.transform = this.transform.bind(this);
    this.resolveImport = this.resolveImport.bind(this);
    this.send = this.send.bind(this);
    this.serverTransform = this.serverTransform.bind(this);
  }

  /**
   * Transform content for 'filePath' request
   *
   * @param { string } filePath
   * @param { string } lastChangedFilePath
   * @param { Res } res
   * @param { TransformHookContext["client"] } clientPlatform
   * @returns { Promise<void> }
   */
  async transform(filePath, lastChangedFilePath, res, clientPlatform) {
    res.metrics.recordEvent(Metrics.EVENT_NAMES.transform);

    // Segment cache by user agent to support different transforms based on client
    const cacheKey = `${clientPlatform.ua}:${filePath}`;
    const relativeFilePath = getProjectPath(filePath);
    // Dependencies that are concatenated during transform aren't cached,
    // but they are watched when read from file system during transformation,
    // so transform again if changed file is of same type
    const lastChangedIsDependency =
      lastChangedFilePath &&
      !this.transformCache.has(`${clientPlatform.ua}:${lastChangedFilePath}`) &&
      getTypeFromPath(lastChangedFilePath) === getTypeFromPath(filePath);
    let code = this.transformCache.get(cacheKey);
    let transformed = false;

    if (lastChangedIsDependency || lastChangedFilePath === filePath || !code) {
      try {
        code = await this._onTransform(
          filePath,
          readFileSync(filePath, 'utf8'),
          { client: clientPlatform },
        );
        if (code !== undefined) {
          transformed = true;
          this.transformCache.set(cacheKey, code);
        }
      } catch (err) {
        debug(`error transforming "${relativeFilePath}"`);
        res.writeHead(500);
        res.end(err.message);
        error(err);
        return;
      }
    }

    if (code !== undefined) {
      debug(
        `${
          transformed ? 'transformed content for' : 'skipping transform for'
        } "${relativeFilePath}"`,
      );
      res.transformed = true;
      // @ts-ignore
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=0',
        'Content-Length': Buffer.byteLength(code),
        'Content-Type': mime.getType(getTypeFromPath(filePath) || filePath),
      });
      res.end(code);
      res.metrics.recordEvent(Metrics.EVENT_NAMES.transform);
    }
  }

  /**
   * Resolve module import "specifier"
   *
   * @param { string } specifier
   * @param { ResolveHookContext } context
   * @param { DefaultResolve } defaultResolve
   */
  resolveImport(specifier, context, defaultResolve) {
    return this._onResolveImport(specifier, context, defaultResolve);
  }

  /**
   * Allow modification of 'filePath' content before sending the request
   *
   * @param { string } filePath
   * @param { string } code
   * @returns { string | undefined }
   */
  send(filePath, code) {
    return this._onSend(filePath, code);
  }

  /**
   * Transform content for 'filePath' import
   *
   * @param { string } filePath
   * @returns { string | undefined }
   */
  serverTransform(filePath) {
    return this._onServerTransform(filePath, readFileSync(filePath, 'utf8'));
  }

  /**
   * Transform file contents hook.
   * Return new file contents or "undefined" if no change.
   *
   * @param { string } filePath
   * @param { string } fileContents
   * @param { TransformHookContext } context
   * @returns { Promise<string> | string | undefined }
   */
  _onTransform(filePath, fileContents, context) {
    return;
  }

  /**
   * Resolve import specifier hook.
   * Return new specifier, "false" to ignore resolving, or "undefined" if relying on default behaviour.
   * When "context.isDynamic", the returned value may include surrounding context:
   * "dynamicImport('resolved-path-to-module', 'parent-path')".
   *
   * @param { string } specifier
   * @param { ResolveHookContext } context
   * @param { DefaultResolve } defaultResolve
   * @returns { string | false | undefined }
   */
  _onResolveImport(specifier, context, defaultResolve) {
    return;
  }

  /**
   * Send file response hook.
   * Return new response body or "undefined" if no change.
   *
   * @param { string } filePath
   * @param { string } responseBody
   * @returns { string | undefined }
   */
  _onSend(filePath, responseBody) {
    return;
  }

  /**
   * Transform file contents hook for server import/require.
   * Return new file contents or "undefined" if no change.
   *
   * @param { string } filePath
   * @param { string } fileContents
   * @returns { string | undefined }
   */
  _onServerTransform(filePath, fileContents) {
    return;
  }
};
