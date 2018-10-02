'use strict';

const { getProjectPath, getTypeFromPath } = require('./file');
const chalk = require('chalk');
const debug = require('debug')('dvlp:transpile');
const { error, info } = require('./log');
const mime = require('mime');
const stopwatch = require('./stopwatch');

/**
 * Transpile content for filepath
 * @param {string} filepath
 * @param {http.ServerResponse} res
 * @param {{ filepathToTranspiled: Map, lastChanged: string, transpiler: (string) => string }} state
 */
module.exports = async function transpile(filepath, res, state) {
  const { filepathToTranspiled, lastChanged, transpiler } = state;
  const relativeFilepath = getProjectPath(filepath);
  // Dependencies that are concatenated during transpile aren't cached,
  // but they are watched when read from file system during transpilation,
  // so transpile again if same type
  const lastChangedIsDependency =
    !!lastChanged &&
    !filepathToTranspiled.has(lastChanged) &&
    getTypeFromPath(lastChanged) === getTypeFromPath(filepath);
  let content = filepathToTranspiled.get(filepath);

  if (lastChangedIsDependency || lastChanged === filepath || !content) {
    try {
      content = await transpiler(filepath);
      if (content) {
        debug(`transpiled content for "${relativeFilepath}"`);
        filepathToTranspiled.set(filepath, content);
      } else {
        debug(`no transpiled content for "${relativeFilepath}"`);
      }
    } catch (err) {
      debug(`error transpiling "${relativeFilepath}"`);
      res.writeHead(500);
      res.end(err.message);
      error(err);
      return;
    }
  }

  if (content) {
    debug(`sending transpiled "${relativeFilepath}"`);
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'max-age=0',
      'Content-Type': mime.getType(getTypeFromPath(filepath) || filepath)
    });
    res.end(content);

    info(
      `${stopwatch.stop(res.url, true, true)} handled transpiled request for ${chalk.green(
        res.url
      )}`
    );
  }
};
