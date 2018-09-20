'use strict';

const { getProjectPath, getTypeFromPath } = require('./file');
const debug = require('debug')('dvlp:transpile');
const { error } = require('./log');
const mime = require('mime');

/**
 * Transpile content for filepath
 * @param {string} filepath
 * @param {http.ServerResponse} res
 * @param {{ filepathToTranspiled: Map, lastChanged: string, transpiler: (string) => string }} state
 */
module.exports = async function transpile(filepath, res, state) {
  const { filepathToTranspiled, lastChanged, transpiler } = state;
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
        debug(`transpiled content for "${getProjectPath(filepath)}"`);
        filepathToTranspiled.set(filepath, content);
      } else {
        debug(`no transpiled content for "${getProjectPath(filepath)}"`);
      }
    } catch (err) {
      debug(`error transpiling "${getProjectPath(filepath)}"`);
      res.writeHead(500);
      res.end(err.message);
      error(err);
      return;
    }
  }

  if (content) {
    debug(`sending transpiled "${getProjectPath(filepath)}"`);
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'max-age=0',
      'Content-Type': mime.getType(getTypeFromPath(filepath) || filepath)
    });
    res.end(content);
  }
};
