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
 * @param { Map<string, string> } state.transpilerCache
 * @param { string } state.lastChanged
 * @param { (filePath: string, isServer: boolean) => Promise<string> | string | undefined } state.transpiler
 * @returns { Promise<void> }
 */
module.exports = async function transpile(filePath, res, state) {
  const { transpilerCache, lastChanged, transpiler } = state;
  const relativeFilePath = getProjectPath(filePath);
  // Dependencies that are concatenated during transpile aren't cached,
  // but they are watched when read from file system during transpilation,
  // so transpile again if same type
  const lastChangedIsDependency =
    !!lastChanged &&
    !transpilerCache.has(lastChanged) &&
    getTypeFromPath(lastChanged) === getTypeFromPath(filePath);
  let content = transpilerCache.get(filePath);
  let transpiled = false;

  if (lastChangedIsDependency || lastChanged === filePath || !content) {
    try {
      content = await transpiler(filePath, false);
      if (content) {
        transpiled = true;
        transpilerCache.set(filePath, content);
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
    debug(
      `${
        transpiled ? 'transpiled content for' : 'skipping transpile for'
      } "${relativeFilePath}"`
    );
    res.transpiled = true;
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
