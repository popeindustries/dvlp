'use strict';

const { exists, expandPath, getProjectPath } = require('../utils/file.js');
const { info, error } = require('../utils/log.js');
const chalk = require('chalk');
const config = require('../config.js');
const DvlpServer = require('./server.js');
const fs = require('fs');
const path = require('path');
const { reloadServer } = require('../reloader/index.js');
const secureProxyServer = require('../secure-proxy/index.js');

/**
 * Server instance factory
 *
 * @param { string | Array<string> | (() => void) } filePath
 * @param { ServerOptions } options
 * @returns { Promise<Server> }
 */
module.exports = async function serverFactory(
  filePath = process.cwd(),
  {
    certsPath,
    directories,
    hooksPath,
    mockPath,
    port = config.applicationPort,
    reload = true,
    silent,
  } = {},
) {
  const entry = resolveEntry(filePath, directories);

  config.directories = Array.from(new Set(entry.directories));

  if (certsPath) {
    certsPath = expandPath(certsPath);
  }

  if (mockPath) {
    mockPath = expandPath(mockPath);
  }

  /** @type { Reloader | undefined } */
  let reloader;
  /** @type { SecureProxy | undefined } */
  let secureProxy;

  if (process.env.PORT === undefined) {
    process.env.PORT = String(port);
  }

  if (hooksPath) {
    hooksPath = path.resolve(hooksPath);

    info(
      `${chalk.green('✔')} registered hooks at ${chalk.green(
        getProjectPath(hooksPath),
      )}`,
    );
  }

  if (certsPath) {
    secureProxy = await secureProxyServer(certsPath, reload);
  } else if (reload) {
    reloader = await reloadServer();
  }

  const server = new DvlpServer(
    entry.main,
    reload ? secureProxy || reloader : undefined,
    hooksPath,
    mockPath,
  );

  try {
    await server.start();
  } catch (err) {
    error(err);
  }

  config.applicationPort = server.port;
  const parentDir = path.resolve(process.cwd(), '..');
  // prettier-ignore
  const paths = entry.isStatic
    ? config.directories
      .map((dir) => path.relative(parentDir, dir) || path.basename(parentDir))
      .join(', ')
    : entry.isFunction
    ? 'function'
    // @ts-ignore
    : getProjectPath(entry.main);
  const origin =
    secureProxy && secureProxy.commonName
      ? `https://${secureProxy.commonName}`
      : server.origin;

  info(`\n  💥 serving ${chalk.green(paths)}`);
  info(`    ...at ${chalk.green.underline(origin)}`);
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
        secureProxy && secureProxy.destroy(),
        server.destroy(),
      ]).then();
    },
  };
};

/**
 * Resolve entry data from "filePaths"
 *
 * @param { string | Array<string> | (() => void) } filePath
 * @param { Array<string> } directories
 * @returns { Entry }
 */
function resolveEntry(filePath, directories = []) {
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

  for (const directory of directories) {
    entry.directories.push(path.resolve(directory));
  }

  return entry;
}
