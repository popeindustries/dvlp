'use strict';

const appServer = require('./appServer');
const fs = require('fs');
const path = require('path');
const reloadServer = require('./reloadServer');
const staticServer = require('./staticServer');

const DEFAULT_PORT = 8080;

/**
 * Create server
 * @param {string|Array<string>} filepath
 * @param {{ port: number, reload: boolean }} options
 * @returns {Promise<{ destroy: () => null }>}
 */
module.exports = function server(
  filepath = process.cwd(),
  { port = Number(process.env.PORT) || DEFAULT_PORT, reload = true } = {}
) {
  return new Promise(async (resolve, reject) => {
    let rServer, server;

    if (reload) {
      rServer = await reloadServer();
    }

    if (Array.isArray(filepath) || fs.statSync(filepath).isDirectory()) {
      server = await staticServer(filepath, { port, reloadServer: rServer });
    } else {
    }
  });
};
