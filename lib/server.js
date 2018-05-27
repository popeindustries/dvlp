'use strict';

const { destroyWorkers } = require('./utils/module');
const { exists, importModule } = require('./utils/file');
const { info } = require('./utils/log');
const appServer = require('./appServer');
const fs = require('fs');
const path = require('path');
const reloadServer = require('./reloadServer');
const staticServer = require('./staticServer');

/**
 * Create server
 * @param {string|[string]} filepath
 * @param {{ port: number, reload: boolean, config: string }} options
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function server(
  filepath = process.cwd(),
  { port = Number(process.env.PORT), reload = true, config } = {}
) {
  exists(filepath);

  if (config) {
    config = importModule(path.resolve(config)).default;
  }

  let rServer, server;

  if (reload) {
    rServer = await reloadServer();
  }

  if (Array.isArray(filepath) || fs.statSync(path.resolve(filepath)).isDirectory()) {
    server = await staticServer(filepath, { port, reloadServer: rServer, rollupConfig: config });
  } else {
    server = await appServer(filepath, { port, reloadServer: rServer, rollupConfig: config });
  }

  info('  Waiting for changes...\n');

  return {
    destroy() {
      Promise.all([rServer && rServer.destroy(), server.destroy(), destroyWorkers()]);
    }
  };
};
