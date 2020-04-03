'use strict';

const {
  exists,
  expandPath,
  getProjectPath,
  importModule,
} = require('../utils/file.js');
const { info, error } = require('../utils/log.js');
const chalk = require('chalk');
const config = require('../config.js');
const { destroyWorkers } = require('../bundler/index.js');
const fs = require('fs');
const path = require('path');
const reloadServer = require('../reloader/index.js');
const DvlpServer = require('./server.js');

/**
 * Server instance factory
 *
 * @param { string | Array<string> | (() => void) } filePath
 * @param { ServerOptions } options
 * @returns { Promise<Server> }
 */
module.exports = async function serverFactory(
  filePath = process.cwd(),
  { mockPath, port = config.port, reload = true, silent, transpiler } = {},
) {
  const entry = resolveEntry(filePath);

  config.directories = Array.from(new Set(entry.directories));

  if (mockPath) {
    mockPath = expandPath(mockPath);
  }

  /** @type { Reloader | undefined } */
  let reloader;
  let rollupConfig;
  let transpilerPath;

  if (process.env.PORT === undefined) {
    process.env.PORT = String(port);
  }

  if (fs.existsSync(config.rollupConfigPath)) {
    rollupConfig = importModule(config.rollupConfigPath);
    info(
      `${chalk.green('✔')} registered custom Rollup.js config at ${chalk.green(
        getProjectPath(config.rollupConfigPath),
      )}`,
    );
  }
  if (transpiler) {
    transpilerPath = path.resolve(transpiler);

    info(
      `${chalk.green('✔')} loaded transpiler from ${chalk.green(
        getProjectPath(transpilerPath),
      )}`,
    );
  }
  if (reload) {
    reloader = await reloadServer();
  }

  const server = new DvlpServer(
    entry.main,
    reloader,
    rollupConfig,
    transpilerPath,
    mockPath,
  );

  try {
    await server.start();
  } catch (err) {
    error(err);
  }

  const parentDir = path.resolve(process.cwd(), '..');
  const paths = entry.isStatic
    ? config.directories
        .map((dir) => path.relative(parentDir, dir) || path.basename(parentDir))
        .join(', ')
    : entry.isFunction
    ? 'function'
    : getProjectPath(entry.main);

  info(
    `\n  💥 serving ${chalk.green(paths)} at ${chalk.green.underline(
      server.origin,
    )}`,
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
        destroyWorkers(),
      ]).then();
    },
  };
};

/**
 * Resolve entry data from "filePaths"
 *
 * @param { string | Array<string> | (() => void) } filePath
 * @returns { Entry }
 */
function resolveEntry(filePath) {
  /** @type { Entry } */
  const entry = {
    directories: [],
    isApp: false,
    isStatic: false,
    isFunction: false,
    main: undefined,
  };

  if (typeof filePath !== 'function') {
    filePath = expandPath(filePath);
    exists(filePath);

    for (let directory of [...filePath, process.cwd()]) {
      directory = path.resolve(directory);

      if (fs.statSync(directory).isFile()) {
        entry.isApp = true;
        entry.main = directory;
        directory = path.dirname(directory);
      }

      const nodeModules = path.join(directory, 'node_modules');

      entry.directories.push(directory);
      if (fs.existsSync(nodeModules)) {
        entry.directories.push(nodeModules);
      }
    }

    entry.isStatic = !entry.isApp;
  } else {
    entry.isFunction = true;
    entry.main = filePath;
  }

  return entry;
}
