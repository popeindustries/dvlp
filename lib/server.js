'use strict';

/**
 * @typedef { object } server
 * @property { () => Promise<void> } destroy
 */

const {
  exists,
  expandPath,
  getProjectPath,
  importModule
} = require('./utils/file.js');
const config = require('./config.js');
const { destroyWorkers } = require('./bundler/bundle.js');
const { info, warn, WARN_NO_MOCK } = require('./utils/log.js');
const appServer = require('./app-server.js');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const reloadServer = require('./reload-server.js');
const staticServer = require('./static-server.js');

/**
 * Create server
 *
 * @param { string } filePath
 * @param { object } [options]
 * @param { string | Array<string> } [options.mockpath]
 * @param { number } [options.port]
 * @param { boolean } [options.reload]
 * @param { string } [options.rollupConfig]
 * @param { string } [options.transpiler]
 * @returns { server }
 */
module.exports = async function server(
  filePath = process.cwd(),
  {
    mockpath,
    port = config.port,
    reload = true,
    rollupConfig,
    silent,
    transpiler
  } = {}
) {
  filePath = expandPath(filePath);
  mockpath = expandPath(mockpath);

  if (filePath.length === 1) {
    filePath = filePath[0];
  }

  exists(filePath);

  const isStatic =
    Array.isArray(filePath) ||
    fs.statSync(path.resolve(filePath)).isDirectory();
  let reloader, server;

  if (rollupConfig) {
    const configpath = path.resolve(rollupConfig);

    rollupConfig = importModule(configpath);
    info(
      `${chalk.green('✔')} registered custom Rollup.js config at ${chalk.green(
        getProjectPath(configpath)
      )}`
    );
  }
  if (transpiler) {
    const transpilerpath = path.resolve(transpiler);

    transpiler = importModule(transpilerpath);
    info(
      `${chalk.green('✔')} loaded transpiler from ${chalk.green(
        getProjectPath(transpilerpath)
      )}`
    );
  }
  if (mockpath && isStatic) {
    warn(WARN_NO_MOCK);
  }
  if (reload) {
    reloader = await reloadServer();
  }

  if (isStatic) {
    server = await staticServer(filePath, {
      port,
      reloader,
      rollupConfig,
      transpiler
    });
  } else {
    server = await appServer(filePath, {
      mockpath,
      port,
      reloader,
      rollupConfig,
      transpiler
    });
  }

  config.activePort = server.port;

  info('👀 watching for changes...\n');

  if (silent) {
    require('./utils/log').silent = true;
  }

  return {
    destroy() {
      return Promise.all([
        reloader && reloader.destroy(),
        server.destroy(),
        destroyWorkers()
      ]);
    }
  };
};
