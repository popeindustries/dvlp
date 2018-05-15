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
 * @param {{ headers: object, port: number, reload: boolean }} options
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function server(
  filepath = process.cwd(),
  { port = Number(process.env.PORT) || DEFAULT_PORT, reload = false } = {}
) {
  let rServer, server;

  if (reload) {
    rServer = await reloadServer();
  }

  if (Array.isArray(filepath) || fs.statSync(path.resolve(filepath)).isDirectory()) {
    server = await staticServer(filepath, { port, reloadServer: rServer });
  } else {
    server = await appServer(filepath, { port, reloadServer: rServer });
  }

  return {
    destroy() {
      Promise.all([rServer.destroy(), server.destroy()]);
    }
  };
};
