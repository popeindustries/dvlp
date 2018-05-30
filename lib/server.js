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
 * @param {{ port: number, reload: boolean, rollupConfig: string, transpiler: string }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function server(
  filepath = process.cwd(),
  { port = Number(process.env.PORT), reload = true, rollupConfig, transpiler } = {}
) {
  exists(filepath);

  let reloader, server;

  if (rollupConfig) {
    rollupConfig = importModule(path.resolve(rollupConfig)).default;
  }
  if (transpiler) {
    transpiler = importModule(path.resolve(transpiler)).default;
  }
  if (reload) {
    reloader = await reloadServer();
  }

  if (Array.isArray(filepath) || fs.statSync(path.resolve(filepath)).isDirectory()) {
    server = await staticServer(filepath, { port, reloader, rollupConfig, transpiler });
  } else {
    server = await appServer(filepath, { port, reloader, rollupConfig, transpiler });
  }

  info('Waiting for changes...\n');

  return {
    destroy() {
      Promise.all([reloader && reloader.destroy(), server.destroy(), destroyWorkers()]);
    }
  };
};
