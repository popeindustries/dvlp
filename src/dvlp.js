import { exists, expandPath, getProjectPath, importModule } from './utils/file.js';
import logger, { error, info } from './utils/log.js';
import chalk from 'chalk';
import { init as cjsLexerInit } from 'cjs-module-lexer';
import config from './config.js';
import { createApplicationLoader } from './hooks/loader.js';
import DvlpServer from './server/index.js';
import { init as esLexerInit } from 'es-module-lexer';
import fs from 'fs';
import path from 'path';

export * as esbuild from 'esbuild';

/**
 * Server instance factory
 *
 * @param { string | Array<string> | (() => void) } filePath
 * @param { ServerOptions } options
 * @returns { Promise<Server> }
 */
export async function server(
  filePath = process.cwd(),
  { certsPath, directories, hooksPath, mockPath, port = config.defaultPort, reload = true, silent } = {},
) {
  const entry = resolveEntry(filePath, directories);
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
    hooks.filePath = hooksPath;
    info(`  ${chalk.green('✔')} registered hooks at ${chalk.green(getProjectPath(hooksPath))}`);
  }
  if (certsPath) {
    certsPath = expandPath(certsPath);
    entry.isSecure = true;
    port = 443;
  }
  if (process.env.PORT === undefined) {
    process.env.PORT = String(port);
  }

  createApplicationLoader(config.applicationLoaderPath, hooks);

  const server = new DvlpServer(entry, port, reload, hooks, mockPath, certsPath);

  try {
    await server.start();
  } catch (err) {
    error(err);
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

  info(`\n  💥 serving ${chalk.green(paths)}`);
  info(`    ...at ${chalk.green.underline(origin)}`);
  info(' 👀 watching for changes...\n');

  if (silent) {
    logger.silent = true;
  }

  return {
    destroy() {
      return server.destroy();
    },
  };
}

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
