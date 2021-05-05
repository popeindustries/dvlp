import { exists, expandPath, getProjectPath, isCjsFile } from '../utils/file.js';
import logger, { error, info } from '../utils/log.js';
import chalk from 'chalk';
import config from '../config.js';
import DvlpServer from './server.js';
import fs from 'fs';
import { init } from 'cjs-module-lexer';
import path from 'path';
import { pathToFileURL } from 'url';
import { reloadServer } from '../reloader/index.js';
import secureProxyServer from '../secure-proxy/index.js';

/**
 * Server instance factory
 *
 * @param { string | Array<string> | (() => void) } filePath
 * @param { _dvlp.ServerOptions } options
 * @returns { Promise<_dvlp.Server> }
 */
export default async function serverFactory(
  filePath = process.cwd(),
  { certsPath, directories, hooksPath, mockPath, port = config.applicationPort, reload = true, silent } = {},
) {
  const entry = resolveEntry(filePath, directories);
  /** @type { _dvlp.Hooks | undefined } */
  let hooks;
  /** @type { _dvlp.Reloader | undefined } */
  let reloader;
  /** @type { _dvlp.SecureProxy | undefined } */
  let secureProxy;

  config.directories = Array.from(new Set(entry.directories));
  // Set format based on application entry
  if (entry.isApp) {
    // This is also called in utils/file.js, but not awaited, so ensure that the lexer is actually initialised first
    await init();
    // @ts-ignore
    config.applicationFormat = isCjsFile(entry.main, fs.readFileSync(entry.main, 'utf8')) ? 'cjs' : 'esm';
  }
  if (mockPath) {
    mockPath = expandPath(mockPath);
  }
  if (hooksPath) {
    hooksPath = path.resolve(hooksPath);
    // @ts-ignore
    hooks = await import(pathToFileURL(hooksPath));
    if (hooks && 'default' in hooks) {
      // @ts-ignore
      hooks = hooks.default;
    }
    info(`${chalk.green('✔')} registered hooks at ${chalk.green(getProjectPath(hooksPath))}`);
  }
  if (certsPath) {
    certsPath = expandPath(certsPath);
    secureProxy = await secureProxyServer(certsPath, reload);
  } else if (reload) {
    reloader = await reloadServer();
  }
  if (process.env.PORT === undefined) {
    process.env.PORT = String(port);
  }

  const server = new DvlpServer(entry.main, reload ? secureProxy || reloader : undefined, hooks, mockPath);

  try {
    await server.start();
  } catch (err) {
    error(err);
  }

  config.applicationPort = server.port;

  if (secureProxy) {
    secureProxy.setApplicationPort(server.port);
  }

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
  const origin = secureProxy && secureProxy.commonName ? `https://${secureProxy.commonName}` : server.origin;

  info(`\n  💥 serving ${chalk.green(paths)}`);
  info(`    ...at ${chalk.green.underline(origin)}`);
  info(' 👀 watching for changes...\n');

  if (silent) {
    logger.silent = true;
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
}

/**
 * Resolve entry data from "filePaths"
 *
 * @param { string | Array<string> | (() => void) } filePath
 * @param { Array<string> } directories
 * @returns { _dvlp.Entry }
 */
function resolveEntry(filePath, directories = []) {
  /** @type { _dvlp.Entry } */
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
