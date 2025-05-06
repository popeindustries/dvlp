/**
 * - `createServer`: proxy in all threads, find first server, force to http, force random port, return used port to main process
 * - intercept client requests in all threads, redirect mocks to main endpoint
 * - intercept file reads in all threads, send filepath to main process
 */

import { exists, getProjectPath, importModule } from './utils/file.js';
import logger, { fatal, noisyInfo } from './utils/log.js';
import { bootstrap } from './utils/bootstrap.js';
import chalk from 'chalk';
import { init as cjsLexerInit } from 'cjs-module-lexer';
import config from './config.js';
import { createApplicationLoaderFile } from './application-host/index.js';
import { createElectronEntryFile } from './electron-host/index.js';
import { Dvlp } from './server/index.js';
import { init as esLexerInit } from 'es-module-lexer';
import { expandPath } from './utils/expand-path.js';
import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';

export { getDependencies } from './utils/module.js';

// Enable code cache in default location (tmpdir/node-compile-cache)
// NOTE: not available in older Node versions
module.enableCompileCache?.();

/**
 * Server instance factory
 *
 * @param { string | Array<string> } filePath
 * @param { ServerOptions } options
 * @returns { Promise<Server> }
 */
export async function server(
  filePath = process.cwd(),
  {
    argv = [],
    certsPath,
    directories,
    electron = false,
    hooksPath,
    mockPath,
    port = config.defaultPort,
    reload = true,
    silent = false,
    verbose = false,
  } = {},
) {
  bootstrap();
  const entry = resolveEntry(filePath, directories, electron);
  /** @type { Hooks | undefined } */
  let hooks;

  await cjsLexerInit();
  await esLexerInit;

  if (silent) {
    logger.silent = true;
  }
  if (verbose) {
    logger.verbose = true;
  }

  config.directories = Array.from(new Set(entry.directories));
  if (mockPath) {
    mockPath = expandPath(mockPath);
  }
  if (hooksPath) {
    hooksPath = path.resolve(hooksPath);
    hooks = /** @type { Hooks } */ (await importModule(hooksPath));
    noisyInfo(
      `${chalk.green('✔')} registered hooks at ${chalk.green(
        getProjectPath(hooksPath),
      )}`,
    );
  }
  if (certsPath) {
    certsPath = expandPath(certsPath);
    entry.isSecure = true;
    // Override default
    if (port === config.defaultPort) {
      port = 443;
    }
  }

  createApplicationLoaderFile(config.applicationLoaderURL, {
    hooks,
    hooksPath,
  });

  if (electron) {
    if (typeof entry.main !== 'string') {
      throw Error(`the "--electron" flag requires a valid entry file path`);
    }
    createElectronEntryFile(config.electronEntryURL);
  }

  const server = new Dvlp(
    entry,
    port,
    reload,
    hooks,
    mockPath,
    certsPath,
    argv,
  );

  try {
    await server.start();
  } catch (err) {
    fatal(err);
    process.exit(1);
  }

  const parentDir = path.resolve(process.cwd(), '..');
  const paths = entry.isStatic
    ? config.directories
        .filter((dir) => !dir.includes('node_modules'))
        .map((dir) => path.relative(parentDir, dir) || path.basename(parentDir))
        .join(', ')
    : getProjectPath(/** @type { string } */ (entry.main));
  const origin = server.origin;
  const appOrigins = server.applicationHost?.appOrigins;
  const electronAppOrigins = server.electronHost?.appOrigins;

  noisyInfo(`\n  💥 serving ${chalk.green(paths)}`);
  noisyInfo(`    ...at ${chalk.green.underline(origin)}`);
  if (appOrigins) {
    for (const appOrigin of appOrigins) {
      noisyInfo(
        `    (proxied application server started at ${chalk.bold(appOrigin)})`,
      );
    }
  } else if (electronAppOrigins) {
    for (const electronAppOrigin of electronAppOrigins) {
      noisyInfo(
        `    (proxied Electron application server started at ${chalk.bold(
          electronAppOrigin,
        )})`,
      );
    }
  }
  noisyInfo('\n  👀 watching for changes...\n');

  process.on('exit', () => {
    server.destroy();
  });

  const applicationWorker = server.applicationHost
    ? {
        get activeThread() {
          return server.applicationHost?.activeThread;
        },
        get isListening() {
          return server.applicationHost?.activeThread?.isListening ?? false;
        },
        origins: server.applicationHost.appOrigins,
        /** @param { string | Array<string> } filePaths */
        addWatchFiles(filePaths) {
          server.applicationHost?.addWatchFiles(filePaths);
        },
        /** @param { string | object | number | boolean | bigint } msg */
        sendMessage(msg) {
          server.applicationHost?.activeThread?.messagePort.postMessage(msg);
        },
      }
    : undefined;
  const electronProcess = server.electronHost
    ? {
        get activeProcess() {
          return server.electronHost?.activeProcess;
        },
        get isListening() {
          return server.electronHost?.isListening ?? false;
        },
        origins: server.electronHost.appOrigins,
        /** @param { string | Array<string> } filePaths */
        addWatchFiles(filePaths) {
          server.electronHost?.addWatchFiles(filePaths);
        },
        /** @param { string | object | number | boolean | bigint } msg */
        sendMessage(msg) {
          server.electronHost?.activeProcess.send(msg);
        },
      }
    : undefined;

  return {
    entry,
    get isListening() {
      return server.isListening;
    },
    origin: server.origin,
    mocks: server.mocks,
    port: server.port,
    applicationWorker,
    electronProcess,
    addWatchFiles(filePaths) {
      server.addWatchFiles(filePaths);
    },
    destroy() {
      return server.destroy();
    },
  };
}

/**
 * Resolve entry data from "filePaths"
 *
 * @param { string | Array<string> } filePath
 * @param { Array<string> } directories
 * @param { boolean } electron
 * @returns { Entry }
 */
function resolveEntry(filePath, directories = [], electron) {
  /** @type { Entry } */
  const entry = {
    directories: [],
    isApp: false,
    isElectron: electron,
    isSecure: false,
    isStatic: false,
    main: undefined,
  };

  filePath = expandPath(filePath);
  exists(filePath);

  for (let directory of [...filePath, process.cwd()]) {
    directory = path.resolve(directory);

    if (fs.statSync(directory).isFile()) {
      entry.isApp = !electron;
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

  for (const directory of directories) {
    entry.directories.push(path.resolve(directory));
  }

  return entry;
}
