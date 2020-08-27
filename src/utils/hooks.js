'use strict';

const { getProjectPath, getTypeFromPath } = require('./file.js');
const debug = require('debug')('dvlp:hooks');
const { error } = require('./log.js');
const { importModule } = require('./module.js');
const Metrics = require('./metrics.js');
const mime = require('mime');
const { readFileSync } = require('fs');

const RE_TRANSPILER_HANDLES_SERVER = /\(\s?[a-zA-Z]+,\s?[a-zA-Z]+\s?\)/;

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
      if (module.onSend) {
        this._onSend = module.onSend;
      }
      if (module.onServerTransform) {
        this._onServerTransform = module.onServerTransform;
      }
    } else if (transpilerPath) {
      /** @type { Transpiler } */
      const transpiler = importModule(transpilerPath);
      const hasServerTranspiler = RE_TRANSPILER_HANDLES_SERVER.test(
        transpiler.toString(),
      );

      /**
       * @param { string } filePath
       * @param { string } code
       */
      this._onTransform = function onTransform(filePath, code) {
        return transpiler(filePath, false);
      };

      if (hasServerTranspiler) {
        /**
         * @param { string } filePath
         * @param { string } code
         */
        this._onTransformServer = function onTransformServer(filePath, code) {
          return transpiler(filePath, true);
        };
      }
    }

    /** @type { Map<string, string> } */
    this.transformCache = new Map();
    this.transform = this.transform.bind(this);
    this.send = this.send.bind(this);
    this.serverTransform = this.serverTransform.bind(this);
  }

  /**
   * Transform content for 'filePath' request
   *
   * @param { string } filePath
   * @param { string } lastChangedFilePath
   * @param { Res } res
   * @returns { Promise<void> }
   */
  async transform(filePath, lastChangedFilePath, res) {
    res.metrics.recordEvent(Metrics.EVENT_NAMES.transform);

    const relativeFilePath = getProjectPath(filePath);
    // Dependencies that are concatenated during transform aren't cached,
    // but they are watched when read from file system during transformation,
    // so transform again if changed file is of same type
    const lastChangedIsDependency =
      lastChangedFilePath &&
      !this.transformCache.has(lastChangedFilePath) &&
      getTypeFromPath(lastChangedFilePath) === getTypeFromPath(filePath);
    let code = this.transformCache.get(filePath);
    let transformed = false;

    if (lastChangedIsDependency || lastChangedFilePath === filePath || !code) {
      try {
        code = await this._onTransform(
          filePath,
          readFileSync(filePath, 'utf8'),
        );
        if (code !== undefined) {
          transformed = true;
          this.transformCache.set(filePath, code);
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
   * Transform code hook
   *
   * @param { string } filePath
   * @param { string } code
   * @returns { Promise<string> | string | undefined }
   */
  _onTransform(filePath, code) {
    return;
  }

  /**
   * Send hook
   *
   * @param { string } filePath
   * @param { string } code
   * @returns { string | undefined }
   */
  _onSend(filePath, code) {
    return;
  }

  /**
   * Transform server code hook
   *
   * @param { string } filePath
   * @param { string } code
   * @returns { string | undefined }
   */
  _onServerTransform(filePath, code) {
    return;
  }
};
