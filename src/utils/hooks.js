'use strict';

const { getProjectPath, getTypeFromPath } = require('./file.js');
const debug = require('debug')('dvlp:hooks');
const { error } = require('./log.js');
const { importModule } = require('./module.js');
const Metrics = require('./metrics.js');
const mime = require('mime');
const { readFileSync } = require('fs');

module.exports = class Hooks {
  /**
   * Constructor
   *
   * @param { String } [hooksPath]
   */
  constructor(hooksPath) {
    if (hooksPath) {
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
    }

    /** @type { Map<string, string> } */
    this.transformCache = new Map();
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
   * @returns { Promise<void> }
   */
  async send(filePath) {
    await this._onSend(filePath, readFileSync(filePath, 'utf8'));
  }

  serverTransform() {}

  /**
   * Transform code hook
   *
   * @param { String } filePath
   * @param { String } code
   * @returns { Promise<string> | string | undefined }
   */
  _onTransform(filePath, code) {
    return code;
  }

  /**
   * Send hook
   *
   * @param { String } filePath
   * @param { String } code
   * @returns { Promise<string> | string | undefined }
   */
  _onSend(filePath, code) {
    return code;
  }

  /**
   * Transform server code hook
   *
   * @param { String } filePath
   * @param { String } code
   * @returns { string }
   */
  _onServerTransform(filePath, code) {
    return code;
  }
};
