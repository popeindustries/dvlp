import {
  createElectronEntryFile,
  spawnElectron,
} from './electron-host/index.js';
import {
  exists,
  expandPath,
  getProjectPath,
  importModule,
} from './utils/file.js';
import logger, { error, info } from './utils/log.js';
import chalk from 'chalk';
import { init as cjsLexerInit } from 'cjs-module-lexer';
import config from './config.js';
import { createApplicationLoaderFile } from './application-host/index.js';
import { Dvlp } from './server/index.js';
import { init as esLexerInit } from 'es-module-lexer';
import fs from 'node:fs';
import path from 'node:path';

// Export for easy import in loader hook
// @see src/hooks/loader.js#L28
export * as esbuild from 'esbuild';
export { nodeResolve } from './resolver/index.js';

/**
 * Server instance factory
 *
 * @param { string | Array<string> | (() => void) } filePath
 * @param { ServerOptions } options
 * @returns { Promise<Server> }
 */
export async function server(
  filePath = process.cwd(),
  {
    certsPath,
    directories,
    electron = false,
    hooksPath,
    mockPath,
    port = config.defaultPort,
    reload = true,
    silent,
  } = {},
) {
  const entry = resolveEntry(filePath, directories, electron);
  /** @type { Hooks | undefined } */
  let hooks;

  await cjsLexerInit();
  await esLexerInit;

  config.directories = Array.from(new Set(entry.directories));
  if (mockPath) {
    mockPath = expandPath(mockPath);
  }
  if (hooksPath) {
    hooksPath = path.resolve(hooksPath);
    hooks = /** @type { Hooks } */ (await importModule(hooksPath));
    info(
      `${chalk.green('✔')} registered hooks at ${chalk.green(
        getProjectPath(hooksPath),
      )}`,
    );
  }
  if (certsPath) {
    certsPath = expandPath(certsPath);
    entry.isSecure = true;
    port = 443;
  }
  if (process.env.PORT === undefined) {
    process.env.PORT = String(port);
  }

  createApplicationLoaderFile(config.applicationLoaderPath, {
    hooks,
    hooksPath,
  });

  const server = new Dvlp(entry, port, reload, hooks, mockPath, certsPath);
  try {
    await server.start();
  } catch (err) {
    error(err);
  }

  if (electron) {
    if (typeof entry.main !== 'string') {
      throw Error(`the "--electron" flag requires a valid entry file path`);
    }
    createElectronEntryFile(
      config.electronEntryPath,
      entry.main,
      server.origin,
    );
    try {
      await spawnElectron(config.electronEntryPath);
    } catch (err) {
      console.error(err);
    }
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
  const origin = server.origin;
  const appOrigin = server.applicationHost?.appOrigin;

  info(`\n  💥 serving ${chalk.green(paths)}`);
  info(`    ...at ${chalk.green.underline(origin)}`);
  if (appOrigin) {
    info(
      `    (proxied application server started at ${chalk.bold(appOrigin)})`,
    );
  }
  info('\n  👀 watching for changes...\n');

  if (silent) {
    logger.silent = true;
  }

  return {
    destroy() {
      // TODO: kill electron
      return server.destroy();
    },
  };
}

/**
 * Resolve entry data from "filePaths"
 *
 * @param { string | Array<string> | (() => void) } filePath
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
    isFunction: false,
    isSecure: false,
    isStatic: false,
    main: undefined,
  };

  if (typeof filePath !== 'function') {
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
  } else {
    entry.isApp = true;
    entry.isFunction = true;
    entry.main = filePath;
  }

  for (const directory of directories) {
    entry.directories.push(path.resolve(directory));
  }

  return entry;
}
