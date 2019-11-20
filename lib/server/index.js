'use strict';

/**
 * @typedef { object } Server
 * @property { number } port
 * @property { () => Promise<void> } restart
 * @property { () => Promise<void> } destroy
 */

const {
  exists,
  expandPath,
  getProjectPath,
  importModule
} = require('../utils/file.js');
const { info, error } = require('../utils/log.js');
const chalk = require('chalk');
const config = require('../config.js');
const { destroyWorkers } = require('../bundler/index.js');
const fs = require('fs');
const path = require('path');
const reloadServer = require('../reloader/index.js');
const Server = require('./server.js');

/**
 * Server instance factory
 *
 * @param { string | Array<string> } filePath
 * @param { object } [options]
 * @param { string | Array<string> } [options.mockPath]
 * @param { number } [options.port]
 * @param { boolean } [options.reload]
 * @param { boolean } [options.silent]
 * @param { string } [options.transpiler]
 * @param { boolean } [options.watchDeps]
 * @returns { Server }
 */
module.exports = async function serverFactory(
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
  let reloader, rollupConfig;

  config.directories.push(
    ...(Array.isArray(filePath) ? filePath : [filePath]).map((directory) => {
      directory = path.resolve(directory);
      if (fs.statSync(directory).isFile()) {
        directory = path.dirname(directory);
      }
      return directory;
    })
  );

  if (process.env.PORT === undefined) {
    process.env.PORT = port;
  }

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
    filePath = require.resolve('./file-server.js');
  }

  const server = new Server(
    path.resolve(filePath),
    reloader,
    rollupConfig,
    transpiler,
    mockPath,
    watchDeps
  );

  try {
    await server.start();
  } catch (err) {
    error(err);
  }

  info(
    `\n  💥 serving ${chalk.green(
      getProjectPath(filePath)
    )} at ${chalk.green.underline(server.origin)}`
  );

  config.activePort = server.port;

  info('👀 watching for changes...\n');

  if (silent) {
    require('../utils/log').silent = true;
  }

  return {
    port: server.port,
    restart: server.restart.bind(server),
    destroy() {
      return Promise.all([
        reloader && reloader.destroy(),
        server.destroy(),
        destroyWorkers()
      ]);
    }
  };
};
