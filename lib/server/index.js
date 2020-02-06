'use strict';

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
 * @param { ServerOptions } options
 * @returns { Promise<Server> }
 */
module.exports = async function serverFactory(
  filePath = process.cwd(),
  { mockPath, port = config.port, reload = true, silent, transpiler } = {}
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
  const directories = [
    process.cwd(),
    ...(Array.isArray(filePath) ? filePath : [filePath])
  ].reduce((directories, directory) => {
    directory = path.resolve(directory);
    if (fs.statSync(directory).isFile()) {
      directory = path.dirname(directory);
    }

    const nodeModules = path.join(directory, 'node_modules');

    directories.push(directory);
    if (fs.existsSync(nodeModules)) {
      directories.push(nodeModules);
    }

    return directories;
  }, []);
  let reloader, rollupConfig, transpilerPath;

  config.directories = Array.from(new Set(directories));

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
    transpilerPath = path.resolve(transpiler);

    info(
      `${chalk.green('✔')} loaded transpiler from ${chalk.green(
        getProjectPath(transpilerPath)
      )}`
    );
  }
  if (reload) {
    reloader = await reloadServer();
  }

  filePath = isStatic ? null : path.resolve(filePath);

  const server = new Server(
    filePath,
    reloader,
    rollupConfig,
    transpilerPath,
    mockPath
  );

  try {
    await server.start();
  } catch (err) {
    error(err);
  }

  const parentDir = path.resolve(process.cwd(), '..');
  const paths = isStatic
    ? config.directories
        .map((dir) => path.relative(parentDir, dir) || path.basename(parentDir))
        .join(', ')
    : getProjectPath(filePath);

  info(
    `\n  💥 serving ${chalk.green(paths)} at ${chalk.green.underline(
      server.origin
    )}`
  );

  config.activePort = server.port;

  info(' 👀 watching for changes...\n');

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
