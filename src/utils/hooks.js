'use strict';

// const { getProjectPath, getTypeFromPath } = require('./file.js');
// const debug = require('debug')('dvlp:hooks');
// const { error } = require('./log.js');
const { importModule } = require('./module.js');
// const Metrics = require('./metrics.js');
// const mime = require('mime');

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
  async transform(filePath, lastChangedFilePath, res) {}

  async send() {}

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
