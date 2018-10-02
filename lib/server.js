'use strict';

const { exists, getProjectPath, importModule } = require('./utils/file');
const config = require('./config');
const { destroyWorkers } = require('./utils/bundler');
const { info, warn, WARN_NO_MOCK } = require('./utils/log');
const appServer = require('./appServer');
const chalk = require('chalk');
const fs = require('fs');
const mock = require('./utils/mock');
const path = require('path');
const reloadServer = require('./reloadServer');
const staticServer = require('./staticServer');

/**
 * Create server
 * @param {string|[string]} filepath
 * @param {{ mockpath: string|[string], port: number, reload: boolean, rollupConfig: string, transpiler: string }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function server(
  filepath = process.cwd(),
  { mockpath, port = config.port, reload = true, rollupConfig, transpiler } = {}
) {
  exists(filepath);

  const isStatic = Array.isArray(filepath) || fs.statSync(path.resolve(filepath)).isDirectory();
  let reloader, server;

  if (rollupConfig) {
    const configpath = path.resolve(rollupConfig);

    rollupConfig = await importModule(configpath);
    info(
      `${chalk.green('✔')} registered custom Rollup.js config at ${chalk.green(
        getProjectPath(configpath)
      )}`
    );
  }
  if (transpiler) {
    const transpilerpath = path.resolve(transpiler);

    transpiler = await importModule(transpilerpath);
    info(
      `${chalk.green('✔')} loaded transpiler from ${chalk.green(getProjectPath(transpilerpath))}`
    );
  }
  if (mockpath) {
    if (isStatic) {
      warn(WARN_NO_MOCK);
    } else {
      mock.load(mockpath);
    }
  }
  if (reload) {
    reloader = await reloadServer();
  }

  if (isStatic) {
    server = await staticServer(filepath, { port, reloader, rollupConfig, transpiler });
  } else {
    server = await appServer(filepath, { port, reloader, rollupConfig, transpiler });
  }

  config.activePort = server.port;

  info('👀 watching for changes...\n');

  return {
    destroy() {
      return Promise.all([reloader && reloader.destroy(), server.destroy(), destroyWorkers()]);
    }
  };
};
