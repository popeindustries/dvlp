'use strict';

const { getProjectPath } = require('./file');
const debug = require('debug')('dvlp:transpile');
const mime = require('mime');

/**
 * Transpile content for filepath
 * @param {string} filepath
 * @param {http.ServerResponse} res
 * @param {{ filepathToTranspiled: Map, lastChanged: string, transpiler: (string) => string }} state
 */
module.exports = async function transpile(filepath, res, state) {
  const { filepathToTranspiled, lastChanged, transpiler } = state;
  let content = filepathToTranspiled.get(filepath);

  if (lastChanged === filepath || !content) {
    try {
      content = await transpiler(filepath);
      if (content) {
        debug(`transpiled content for "${getProjectPath(filepath)}"`);
        filepathToTranspiled.set(filepath, content);
      } else {
        debug(`no transpiled content for "${getProjectPath(filepath)}"`);
      }
    } catch (err) {
      // TODO: notify
      debug(`error transpiling "${getProjectPath(filepath)}"`);
      res.writeHead(500, err.message);
      res.end(err.message);
      return;
    }
  }

  if (content) {
    debug(`sending transpiled "${getProjectPath(filepath)}"`);
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'max-age=0',
      // TODO: convert to transpiled type?
      'Content-Type': mime.getType(filepath)
    });
    res.end(content);
  }
};
