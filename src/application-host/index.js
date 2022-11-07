import { dirname, join, relative } from 'node:path';
import { error, fatal, noisyInfo } from '../utils/log.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, msDiff } from '../utils/metrics.js';
import { MessageChannel, SHARE_ENV, Worker } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import config from '../config.js';
import Debug from 'debug';
import { getProjectPath } from '../utils/file.js';
import http from 'node:http';
import { isProxy } from '../utils/is.js';
import { performance } from 'node:perf_hooks';
import { request } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { watch } from '../utils/watch.js';

const debug = Debug('dvlp:apphost');
const __dirname = dirname(fileURLToPath(import.meta.url));
let workerPath = relative(
  process.cwd(),
  join(__dirname, './application-worker.js'),
).replace(/\\/g, '/');

if (!workerPath.startsWith('.')) {
  workerPath = `./${workerPath}`;
}

/**
 * Create application loader based on passed hooks
 *
 * @param { import('url').URL } filePath
 * @param { { hooks?: Hooks, hooksPath?: string } } hooksConfig
 */
export function createApplicationLoaderFile(filePath, hooksConfig) {
  const hooksPath =
    hooksConfig.hooks &&
    (hooksConfig.hooks.onServerTransform || hooksConfig.hooks.onServerResolve)
      ? hooksConfig.hooksPath
      : undefined;
  const contents =
    (hooksPath
      ? `import customHooks from '${hooksPath}';\n`
      : 'const customHooks = {};\n') +
    readFileSync(join(__dirname, 'application-loader.js'));

  writeFileSync(filePath, contents);
}

export class ApplicationHost {
  /**
   * @param { string | (() => void) } main
   * @param { number } appPort
   * @param { string } hostOrigin
   * @param { (filePath: string, silent?: boolean) => void } [triggerClientReload]
   * @param { Array<SerializedMock> } [serializedMocks]
   * @param { Array<string> } [argv]
   */
  constructor(
    main,
    appPort,
    hostOrigin,
    triggerClientReload,
    serializedMocks,
    argv,
  ) {
    this.argv = argv;
    this.appOrigin = `http://localhost:${appPort}`;
    this.appPort = appPort;
    this.hostOrigin = hostOrigin;
    this.main = main;
    this.serializedMocks = serializedMocks;
    /** @type { DestroyableHttpServer | undefined } */
    this.server;
    /** @type { Watcher | undefined } */
    this.watcher;

    if (triggerClientReload !== undefined) {
      this.watcher = watch(async (filePath) => {
        noisyInfo(
          `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.cyan(
            getProjectPath(filePath),
          )}`,
        );
        await this.restart();
      });
    }

    if (typeof this.main === 'string') {
      if (this.watcher !== undefined) {
        this.watcher.add(this.main);
      }
      this.main = pathToFileURL(this.main).href;
      /** @type { ApplicationThread } */
      this.activeThread = this.createThread();
      /** @type { ApplicationThread } */
      this.pendingThread = this.createThread();
    }
  }

  /**
   * Start application
   *
   * @returns { Promise<void> }
   */
  async start() {
    if (typeof this.main === 'function') {
      proxyCreateServer(this);
      this.main();
      return;
    }

    try {
      /** @type { [start: number, stop: number ]} */
      const times = [performance.now(), 0];

      await this.activeThread.start(this.main);

      times[1] = performance.now();
      const duration = msDiff(times);

      noisyInfo(`${format(duration)} application server started`);
    } catch (err) {
      error(err);
    }
  }

  /**
   * Restart application
   */
  async restart() {
    if (this.activeThread.isListening) {
      debug(`terminating thread with id "${this.activeThread.threadId}"`);
      await this.activeThread.terminate();
    }
    this.activeThread = this.pendingThread;
    this.pendingThread = this.createThread();
    noisyInfo('\n  restarting application server...');
    await this.start();
  }

  /**
   * Handle application request.
   * Pipe incoming request to application running in active thread.
   *
   * @param { Req } req
   * @param { Res } res
   */
  handle(req, res) {
    debug(`handling request for "${req.url}"`);

    if (this.activeThread !== undefined && !this.activeThread.isListening) {
      res.writeHead(500);
      res.end('application server failed to start');
      return;
    }

    /** @type { Record<string, string> } */
    const headers = {
      connection: 'keep-alive',
      // @ts-ignore
      host: req.headers.host || req.headers[':authority'],
    };

    // Prune http2 headers
    for (const header in req.headers) {
      if (header && !header.startsWith(':')) {
        // @ts-ignore
        headers[header] = req.headers[header];
      }
    }

    const requestOptions = {
      headers,
      method: req.method,
      path: req.url,
      port: this.appPort,
    };
    const appRequest = request(requestOptions, (originResponse) => {
      const { statusCode, headers } = originResponse;

      delete headers.connection;
      delete headers['keep-alive'];

      res.writeHead(statusCode || 200, headers);
      originResponse.pipe(res);
    });

    appRequest.on('error', (err) => {
      res.writeHead(500);
      res.end(err.message);
    });

    req.pipe(appRequest);
  }

  /**
   * @private
   */
  createThread() {
    const { port1, port2 } = new MessageChannel();
    const thread = new ApplicationThread(workerPath, port1, this.watcher, {
      argv: this.argv,
      env: SHARE_ENV,
      // @ts-ignore
      execArgv: [
        '--enable-source-maps',
        '--no-warnings',
        '--experimental-loader',
        config.applicationLoaderURL.href,
      ],
      stderr: true,
      workerData: {
        hostOrigin: this.hostOrigin,
        messagePort: port2,
        serverPort: this.appPort,
        serializedMocks: this.serializedMocks,
      },
      transferList: [port2],
    });

    return thread;
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.activeThread?.terminate();
    this.pendingThread?.terminate();
    this.server?.destroy();
    this.watcher?.close();
  }
}

class ApplicationThread extends Worker {
  /**
   * @param { string } filePath
   * @param { import('worker_threads').MessagePort } messagePort
   * @param { Watcher | undefined } watcher
   * @param { import('worker_threads').WorkerOptions } options
   */
  constructor(filePath, messagePort, watcher, options) {
    super(filePath, options);

    /** @type { boolean } */
    this.isListening;
    this.isRegistered = false;
    this.messagePort = messagePort;
    this.watcher = watcher;
    /** @type { ((value?: void | PromiseLike<void>) => void) | undefined } */
    this.resolveStarted;
    /** @type { ((value?: unknown) => void) | undefined } */
    this.rejectStarted;

    this.messagePort.on('message', this.handleMessage.bind(this));

    this.on('error', (err) => {
      if (this.isListening === undefined) {
        this.listening(err);
      }
      fatal(err);
    });
    this.on('exit', (exitCode) => {
      this.messagePort.removeAllListeners();
      this.messagePort.close();
      // @ts-ignore
      this.messagePort = undefined;
      this.watcher = undefined;
    });
    this.stderr.on('data', (chunk) => {
      error(chunk.toString().trimEnd());
    });

    debug(
      `created application thread with id "${this.threadId}" at "${filePath}"`,
    );
  }

  /**
   * @param { string } main
   * @returns { Promise<void>}
   */
  start(main) {
    return new Promise((resolve, reject) => {
      this.resolveStarted = resolve;
      this.rejectStarted = reject;
      debug(`starting application at ${main}`);
      this.messagePort.postMessage({ type: 'start', main });
    });
  }

  /**
   * @param { ApplicationWorkerMessage } msg
   * @private
   */
  handleMessage(msg) {
    switch (msg.type) {
      case 'started': {
        this.listening();
        break;
      }
      case 'watch': {
        if (this.watcher !== undefined) {
          this.watcher.add(msg.paths);
        }
        break;
      }
    }
  }

  /**
   * @param { Error } [err]
   * @private
   */
  listening(err) {
    if (err) {
      this.rejectStarted?.(err);
    } else {
      this.resolveStarted?.();
    }

    this.isListening = err === undefined;
    this.resolveStarted = this.rejectStarted = undefined;
  }
}

/**
 * Intercept server creation
 *
 * @param { ApplicationHost } host
 */
function proxyCreateServer(host) {
  if (!isProxy(http.createServer)) {
    http.createServer = new Proxy(http.createServer, {
      apply(target, ctx, args) {
        /** @type { DestroyableHttpServer } */
        const server = Reflect.apply(target, ctx, args);
        const connections = new Map();

        server.on('connection', (connection) => {
          const key = `${connection.remoteAddress}:${connection.remotePort}`;

          connections.set(key, connection);
          connection.on('close', () => {
            connections.delete(key);
          });
        });
        server.on('listening', () => {
          const address = server.address();
          host.appPort = /** @type { import('net').AddressInfo } */ (
            address
          ).port;
        });

        server.destroy = () => {
          for (const connection of connections.values()) {
            connection.destroy();
          }
          connections.clear();
          server.close();
        };

        host.server = server;

        return server;
      },
    });
    syncBuiltinESMExports();
  }
}