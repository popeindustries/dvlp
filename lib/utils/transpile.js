'use strict';

/**
 * @typedef { import("http").ServerResponse } ServerResponse
 */

const { getProjectPath, getTypeFromPath } = require('./file.js');
const chalk = require('chalk');
const debug = require('debug')('dvlp:transpile');
const { error, info } = require('./log.js');
const mime = require('mime');
const stopwatch = require('./stopwatch.js');

/**
 * Transpile content for filePath
 *
 * @param { string } filePath
 * @param { ServerResponse } res
 * @param { object } state
 * @param { Map<string, string> } state.filePathToTranspiled
 * @param { string } state.lastChanged
 * @param { (string) => string|Promise<string> } state.transpiler
 */
module.exports = async function transpile(filePath, res, state) {
  const { filePathToTranspiled, lastChanged, transpiler } = state;
  const relativeFilePath = getProjectPath(filePath);
  // Dependencies that are concatenated during transpile aren't cached,
  // but they are watched when read from file system during transpilation,
  // so transpile again if same type
  const lastChangedIsDependency =
    !!lastChanged &&
    !filePathToTranspiled.has(lastChanged) &&
    getTypeFromPath(lastChanged) === getTypeFromPath(filePath);
  let content = filePathToTranspiled.get(filePath);

  if (lastChangedIsDependency || lastChanged === filePath || !content) {
    try {
      content = await transpiler(filePath);
      if (content) {
        debug(`transpiled content for "${relativeFilePath}"`);
        filePathToTranspiled.set(filePath, content);
      } else {
        debug(`no transpiled content for "${relativeFilePath}"`);
      }
    } catch (err) {
      debug(`error transpiling "${relativeFilePath}"`);
      res.writeHead(500);
      res.end(err.message);
      error(err);
      return;
    }
  }

  if (content) {
    debug(`sending transpiled "${relativeFilePath}"`);
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'max-age=0',
      'Content-Type': mime.getType(getTypeFromPath(filePath) || filePath)
    });
    res.end(content);

    info(
      `${stopwatch.stop(
        res.url,
        true,
        true
      )} handled transpiled request for ${chalk.green(res.url)}`
    );
  }
};
