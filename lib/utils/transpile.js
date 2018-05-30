'use strict';

const debug = require('debug')('dvlp:transpile');
const mime = require('mime');
const path = require('path');

/**
 * Transpile content for filepath
 * @param {string} filepath
 * @param {http.ServerResponse} res
 * @param {{ filepathToTranspiled: Map, lastChanged: string, transpiler: (string) => string }} state
 */
module.exports = async function transpile(filepath, res, state) {
  const { filepathToTranspiled, lastChanged, transpiler } = state;
  let content = filepathToTranspiled.get(filepath);

  console.log(filepath, lastChanged);

  if (lastChanged === filepath || !content) {
    try {
      content = await transpiler(path.resolve(filepath));
      if (content) {
        debug(`transpiled content for "${filepath}"`);
        filepathToTranspiled.set(filepath, content);
      }
    } catch (err) {
      // TODO: notify
      res.writeHead(500, err.message);
      res.end(err.message);
      return;
    }
  }

  if (content) {
    debug(`sending transpiled "${filepath}"`);
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'max-age=0',
      'Content-Type': mime.getType(filepath)
    });
    res.end(content);
  }
};
