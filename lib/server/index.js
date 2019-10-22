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
} = require('../utils/file.js');
const config = require('../config.js');
const { destroyWorkers } = require('../bundler/index.js');
const appServer = require('./app-server.js');
const chalk = require('chalk');
const fs = require('fs');
const { info } = require('../utils/log.js');
const path = require('path');
const reloadServer = require('../reloader/index.js');
const staticServer = require('./static-server.js');

/**
 * Create server
 *
 * @param { string } filePath
 * @param { object } [options]
 * @param { string | Array<string> } [options.mockPath]
 * @param { number } [options.port]
 * @param { boolean } [options.reload]
 * @param { boolean } [options.silent]
 * @param { string } [options.transpiler]
 * @param { boolean } [options.watchDeps]
 * @returns { server }
 */
module.exports = async function server(
  filePath = process.cwd(),
  {
    mockPath,
    port = config.port,
    reload = true,
    silent,
    transpiler,
    watchDeps
  } = {}
) {
  filePath = expandPath(filePath);
  mockPath = expandPath(mockPath);

  if (filePath.length === 1) {
    filePath = filePath[0];
  }

  exists(filePath);

  const isStatic =
    Array.isArray(filePath) ||
    fs.statSync(path.resolve(filePath)).isDirectory();
  let reloader, rollupConfig, server;

  config.directories.push(
    ...(Array.isArray(filePath) ? filePath : [filePath]).map((directory) => {
      directory = path.resolve(directory);
      if (fs.statSync(directory).isFile()) {
        directory = path.dirname(directory);
      }
      return directory;
    })
  );

  if (fs.existsSync(config.rollupConfigPath)) {
    rollupConfig = importModule(config.rollupConfigPath);
    info(
      `${chalk.green('✔')} registered custom Rollup.js config at ${chalk.green(
        getProjectPath(config.rollupConfigPath)
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
  if (reload) {
    reloader = await reloadServer();
  }
  if (isStatic) {
    server = await staticServer({
      mockPath,
      port,
      reloader,
      rollupConfig,
      transpiler,
      watchDeps
    });
  } else {
    server = await appServer(filePath, {
      mockPath,
      port,
      reloader,
      rollupConfig,
      transpiler,
      watchDeps
    });
  }

  config.activePort = server.port;

  info('👀 watching for changes...\n');

  if (silent) {
    require('../utils/log').silent = true;
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
