'use strict';

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
 * @param { string } filepath
 * @param { { mockpath: string|[string], port: number, reload: boolean, rollupConfig: string, transpiler: string } } [options]
 * @returns { Promise<{ destroy: () => void }> }
 */
module.exports = async function server(
  filepath = process.cwd(),
  {
    mockpath,
    port = config.port,
    reload = true,
    rollupConfig,
    silent,
    transpiler
  } = {}
) {
  filepath = expandPath(filepath);
  mockpath = expandPath(mockpath);

  if (filepath.length === 1) {
    filepath = filepath[0];
  }

  exists(filepath);

  const isStatic =
    Array.isArray(filepath) ||
    fs.statSync(path.resolve(filepath)).isDirectory();
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
    server = await staticServer(filepath, {
      port,
      reloader,
      rollupConfig,
      transpiler
    });
  } else {
    server = await appServer(filepath, {
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
