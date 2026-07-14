/**
 * - `createServer`: proxy in all threads, find first server, force to http, force random port, return used port to main process
 * - intercept client requests in all threads, redirect mocks to main endpoint
 * - intercept file reads in all threads, send filepath to main process
 */

import { exists, getProjectPath, importModule } from './utils/file.ts';
import logger, { fatal, noisyInfo } from './utils/log.ts';
import type { Server, ServerOptions } from './server/types.ts';
import { bootstrap } from './utils/bootstrap.ts';
import chalk from 'chalk';
import { init as cjsLexerInit } from 'cjs-module-lexer';
import config from './config.ts';
import { createApplicationLoaderFile } from './application-host/index.ts';
import { createElectronEntryFile } from './electron-host/index.ts';
import { Dvlp } from './server/index.ts';
import type { Entry } from './types.ts';
import { init as esLexerInit } from 'es-module-lexer';
import { expandPath } from './utils/expand-path.ts';
import fs from 'node:fs';
import type { Hooks } from './hooks/types.ts';
import module from 'node:module';
import path from 'node:path';

export { getDependencies } from './utils/module.ts';

export type {
  Config,
  ContentType,
  Entry,
  Req,
  Res,
  RequestHandler,
} from './types.ts';
export type {
  DefaultResolve,
  DependencyBundleHookContext,
  Hooks,
  NodeLoadLoaderHook,
  NodeResolveLoaderHook,
  ResolveHookContext,
  TransformHookContext,
} from './hooks/types.ts';
export type {
  DeserializedMock,
  MockPushEvent,
  MockPushEventJSONSchema,
  MockPushEventOptions,
  MockPushStream,
  MockRequest,
  MockResponse,
  MockResponseData,
  MockResponseDataType,
  MockResponseHandler,
  MockResponseJSONSchema,
  Mocks,
  MockStreamData,
  MockStreamDataType,
  MockStreamEventData,
  SerializedMock,
} from './mock/types.ts';
export type { Server, ServerOptions } from './server/types.ts';
export type { Package, ResolveResult } from './resolver/types.ts';
export type {
  PushClient,
  PushEvent,
  PushEventOptions,
  PushStream,
} from './push-events/types.ts';
export type {
  ApplicationHostMessage,
  ApplicationLoaderMessage,
  ApplicationProcessWorkerData,
  ApplicationWorker,
  ApplicationWorkerMessage,
  ApplicationWorkerPendingHandle,
} from './application-host/types.ts';
export type {
  ElectronProcess,
  ElectronProcessMessage,
  ElectronProcessWorkerData,
} from './electron-host/types.ts';
export type {
  FindOptions,
  ImportAssertionType,
  InterceptClientRequestCallback,
  InterceptCreateServerCallback,
  InterceptFileAccessCallback,
  PatchResponseOptions,
  Platform,
  RequestContext,
  Watcher,
} from './utils/types.ts';
export type { Metrics } from './utils/metrics.ts';
export type { TestServer } from './test-server/index.ts';
export type { TestServerOptions } from './test-server/types.ts';

// Enable code cache in default location (tmpdir/node-compile-cache)
// NOTE: not available in older Node versions
module.enableCompileCache?.();

/**
 * Server instance factory
 */
export async function server(
  filePath: string | Array<string> = process.cwd(),
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
  }: ServerOptions = {},
): Promise<Server> {
  bootstrap();
  const entry = resolveEntry(filePath, directories, electron);
  let hooks: Hooks | undefined;

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
    hooks = await importModule<Hooks>(hooksPath);
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
    : getProjectPath(entry.main as string);
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
        addWatchFiles(filePaths: string | Array<string>) {
          server.applicationHost?.addWatchFiles(filePaths);
        },
        sendMessage(msg: string | object | number | boolean | bigint) {
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
        addWatchFiles(filePaths: string | Array<string>) {
          server.electronHost?.addWatchFiles(filePaths);
        },
        sendMessage(msg: string | object | number | boolean | bigint) {
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
 */
function resolveEntry(
  filePath: string | Array<string>,
  directories: Array<string> = [],
  electron: boolean,
): Entry {
  const entry: Entry = {
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
