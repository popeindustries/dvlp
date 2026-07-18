import {
  clearCachedResponses,
  invalidateCachedResponses,
  serveCachedResponse,
} from '../utils/response-cache.ts';
import {
  clearContexts,
  getContextForFilePath,
  getContextForReq,
} from '../utils/request-contexts.ts';
import {
  clearModuleGraph,
  findModuleGraphOwners,
} from '../utils/module-graph.ts';
import {
  concatScripts,
  getDvlpGlobalString,
  getPatchedAdoptedStyleSheets,
  getProcessEnvString,
} from '../utils/scripts.ts';
import type {
  Entry,
  Http2SecureServer,
  Http2SecureServerOptions,
  Http2ServerRequest,
  Http2ServerResponse,
  HttpServer,
  IncomingMessage,
  Req,
  Res,
  ServerResponse,
} from '../types.ts';
import { error, info, noisyInfo } from '../utils/log.ts';
import { find, getProjectPath, getRepoPath } from '../utils/file.ts';
import {
  handleDataUrl,
  handleFavicon,
  handleFile,
  handleMockResponse,
  handleMockWebSocket,
  handlePushEvent,
} from './handlers.ts';
import { isBundledFilePath, isNodeModuleFilePath } from '../utils/is.ts';
import type { PatchResponseOptions, Watcher } from '../utils/types.ts';
import { resolveCerts, validateCert } from './certificate-validation.ts';
import { ApplicationHost } from '../application-host/index.ts';
import chalk from 'chalk';
import { clearImportMap } from '../utils/import-map.ts';
import { clearResolverCache } from '../resolver/index.ts';
import config from '../config.ts';
import Debug from 'debug';
import { ElectronHost } from '../electron-host/index.ts';
import { EventSource } from '../reload/event-source.ts';
import fs from 'node:fs';
import { getReloadClientEmbed } from '../reload/reload-client-embed.ts';
import { Hooker } from '../hooks/index.ts';
import type { Hooks } from '../hooks/types.ts';
import http from 'node:http';
import http2 from 'node:http2';
import { interceptFileAccess } from '../utils/intercept-file-access.ts';
import { Metrics } from '../utils/metrics.ts';
import { Mocks } from '../mock/index.ts';
import { parseUserAgent } from '../utils/platform.ts';
import { patchResponse } from '../utils/patch.ts';
import path from 'node:path';
import type { Socket } from 'node:net';
import { watch } from '../utils/watch.ts';

const debug = Debug('dvlp:server');

export class Dvlp {
  watcher: Watcher;
  unlistenForFileRead: () => void;
  certsPath?: string | Array<string>;
  clients: Set<EventSource>;
  connections: Map<string, Socket>;
  entry: Entry;
  hooks: Hooker;
  isListening: boolean;
  lastChanged: Array<string>;
  secureServerOptions: Http2SecureServerOptions | undefined;
  origin: string;
  port: number;
  mocks: Mocks;
  ready: Promise<void>;
  reload: boolean;
  server!: HttpServer | Http2SecureServer;
  patchResponseOptions: PatchResponseOptions;
  applicationHost?: ApplicationHost;
  electronHost?: ElectronHost;

  /**
   * Constructor
   */
  constructor(
    entry: Entry,
    port: number,
    reload = false,
    hooks?: Hooks,
    mockPath?: string | Array<string>,
    certsPath?: string | Array<string>,
    argv?: Array<string>,
  ) {
    this.requestHandler = this.requestHandler.bind(this);
    this.triggerClientReload = this.triggerClientReload.bind(this);

    // Listen for all upcoming file system reads
    // Register early to catch all reads, including transformers that patch fs.readFile
    this.watcher = watch((filePaths) => {
      // Track the whole batch so cache invalidation covers every changed
      // file, not just the last one
      this.lastChanged = filePaths;

      for (const filePath of filePaths) {
        this.triggerClientReload(filePath);
      }
    });

    // Watch project package.json to catch dependency/exports changes
    const packageJsonPath = path.resolve('package.json');
    if (fs.existsSync(packageJsonPath)) {
      this.watcher.add(packageJsonPath);
    }
    this.unlistenForFileRead = interceptFileAccess((filePath) => {
      if (filePath.startsWith(getRepoPath())) {
        this.addWatchFiles(filePath);
      }
    });

    this.certsPath = certsPath;
    this.clients = new Set();
    this.connections = new Map();
    this.entry = entry;
    this.hooks = new Hooker(hooks, this.watcher);
    this.isListening = false;
    this.lastChanged = [];
    this.secureServerOptions = undefined;

    let protocol = 'http';
    let commonName: string | undefined = undefined;
    if (certsPath) {
      const serverOptions = resolveCerts(certsPath);
      commonName = validateCert(serverOptions.cert);
      this.secureServerOptions = { allowHTTP1: true, ...serverOptions };
      protocol = 'https';
    }
    this.origin = commonName
      ? `https://${commonName}`
      : `${protocol}://localhost:${port}`;

    // Make sure mocks instance has access to active port
    this.port = config.activePort = port;
    this.mocks = new Mocks(mockPath);
    this.mocks.activePort = port;
    this.reload = reload;
    this.server;

    const reloadEmbed = reload ? getReloadClientEmbed(port) : '';
    let headerScript = concatScripts([
      getProcessEnvString(),
      getDvlpGlobalString(),
      getPatchedAdoptedStyleSheets(),
    ]);

    this.patchResponseOptions = {
      footerScript: {
        string: reloadEmbed,
      },
      headerScript: {
        string: headerScript,
      },
      resolveImport: this.hooks.resolveImport,
      send: this.hooks.send,
    };

    this.ready = this.mocks.loaded.then(() => {
      headerScript += `\n${this.mocks.client}`;
      this.patchResponseOptions.headerScript = {
        string: headerScript,
      };

      if (entry.isApp && entry.main !== undefined) {
        this.applicationHost = new ApplicationHost(
          entry.main,
          this.origin,
          reload ? this.triggerClientReload : undefined,
          this.mocks.toJSON(),
          argv,
        );
      } else if (entry.isElectron && entry.main !== undefined) {
        this.electronHost = new ElectronHost(
          entry.main,
          this.origin,
          reload ? this.triggerClientReload : undefined,
          this.mocks.toJSON(),
          argv,
        );
      }
    });
  }

  /**
   * Start server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.entry.isSecure) {
        this.server = http2.createSecureServer(
          this.secureServerOptions as Http2SecureServerOptions,
          this.requestHandler,
        );
        this.server.setTimeout(0);
      } else {
        this.server = http.createServer(this.requestHandler);
        this.server.timeout = this.server.keepAliveTimeout = 0;
      }

      this.server.on('error', reject);
      this.server.on('listening', async () => {
        debug('server started');
        this.isListening = true;
        try {
          // Host is only created once mock files have finished loading
          await this.ready;

          if (this.applicationHost) {
            await this.applicationHost.start();
          } else if (this.electronHost) {
            await this.electronHost.start();
          }
        } catch (err) {
          error(err);
        }
        resolve();
      });
      this.server.on('connection', (connection) => {
        const key = `${connection.remoteAddress}:${connection.remotePort}`;

        this.connections.set(key, connection);
        connection.once('close', () => {
          this.connections.delete(key);
        });
      });
      this.server.on('upgrade', (req, socket, body) => {
        handleMockWebSocket(req as Req, socket, body, this.mocks);
      });

      this.server.listen(this.port);
    });
  }

  /**
   * Send refresh/reload message to clients for changed 'filePath'.
   * Will trigger one of:
   *  1. single css refresh if css and a link.href matches filePath
   *  2. multiple css refreshes if css and no link.href matches filePath (ie. it's a dependency)
   *  3. full page reload
   */
  triggerClientReload(filePath: string, silent?: boolean): void {
    if (!this.lastChanged.includes(filePath)) {
      this.lastChanged = [filePath];
    }
    invalidateCachedResponses(filePath);

    // Dependencies or exports may have changed,
    // so previously resolved and rewritten imports are stale
    if (path.basename(filePath) === 'package.json') {
      debug('package.json changed: clearing resolver caches');
      clearResolverCache();
      clearCachedResponses();
    }

    if (!this.reload) {
      return;
    }

    if (!silent) {
      noisyInfo(
        `\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.cyan(
          getProjectPath(filePath),
        )}`,
      );
    }

    // TODO: handle mock/hook update

    const contexts = getReloadContexts(filePath);
    const event = contexts.every((context) => context.type === 'css')
      ? 'refresh'
      : 'reload';

    if (this.clients.size) {
      noisyInfo(
        `\n  ${chalk.yellow(`💫 ${event}ing`)} ${this.clients.size} client${
          this.clients.size > 1 ? 's' : ''
        }\n`,
      );

      for (const client of this.clients) {
        if (event === 'refresh') {
          for (const context of contexts) {
            client.send(JSON.stringify(context), { event });
          }
        } else {
          client.send(JSON.stringify(contexts[0]), { event });
        }
      }
    }
  }

  /**
   * Handle incoming request
   *
   * @private
   */
  async requestHandler(
    request: IncomingMessage | Http2ServerRequest,
    response: ServerResponse | Http2ServerResponse,
  ) {
    const req = request as Req;
    const res = response as Res;
    const { url } = req;

    if (isReloadRequest(req)) {
      if (!this.isListening) {
        // TODO: wait and continue?
        res.writeHead(500);
        res.end('waiting for application server start');
      } else {
        this.registerReloadClient(req, res);
      }

      return;
    }

    res.metrics = new Metrics(res);

    res.once('finish', () => {
      if (!res.unhandled) {
        const duration = res.metrics.getEvent('response', true);
        const modifier = res.bundled
          ? ' bundled '
          : res.mocked
            ? ' mocked '
            : res.cached
              ? ' cached '
              : res.transformed
                ? ' transformed '
                : ' ';
        let localFilePath = getProjectPath(req.filePath || req.url);

        if (res.mocked) {
          // Decode query param and strip "?dvlpmock=" prefix (sometimes double encoded if coming from client)
          localFilePath = decodeURIComponent(
            decodeURIComponent(
              req.url.slice(req.url.indexOf('?dvlpmock=') + 10),
            ),
          );
        }

        // Convert Windows paths and strip query params
        // Requests for "/" will be empty, so default to "index.html"
        localFilePath =
          localFilePath.replace(/\\/g, '/').split('?')[0] || 'index.html';

        const msg = `${duration} handled${chalk.italic(
          modifier,
        )}request for ${chalk.green(localFilePath)}`;

        res.mocked ? noisyInfo(msg) : info(msg);
      } else {
        // TODO: handle app response
        const reroute = res.rerouted
          ? `(re-routed to ${chalk.green(req.url)})`
          : '';
        const duration = res.metrics.getEvent('response', true);

        info(
          res.statusCode < 300
            ? `${duration} handled request for ${chalk.green(url)} ${reroute}`
            : `${duration} [${
                res.statusCode
              }] unhandled request for ${chalk.red(url)} ${reroute}`,
        );
      }
    });

    let context = getContextForReq(req);

    res.url = req.url;

    if (
      handleFavicon(req, res) ||
      handleMockResponse(req, res, this.mocks) ||
      handlePushEvent(req, res, this.mocks)
    ) {
      return;
    }

    // Allow manual response handling via user hook
    if (await this.hooks.handleRequest(req, res)) {
      return;
    }

    if (context.filePath !== undefined) {
      this.addWatchFiles(context.filePath);

      // Serve previously patched response, avoiding transform/rewrite work
      if (serveCachedResponse(req, res, context.filePath)) {
        return;
      }
    }

    // Ignore unknown types
    if (context.type !== undefined) {
      patchResponse(req, res, this.patchResponseOptions);

      if (context.type === 'html' && handleDataUrl(req, res)) {
        return;
      }
    }

    if (context.filePath !== undefined) {
      if (isBundledFilePath(context.filePath)) {
        // Will write new file to disk
        await this.hooks.bundleDependency(context.filePath, res);
      }
      // Transform all files that aren't bundled or node_modules
      // This ensures that all symlinked workspace files are transformed even though they are dependencies
      if (!isNodeModuleFilePath(context.filePath)) {
        // Will respond if transformer exists for this type
        await this.hooks.transform(
          context.filePath,
          this.lastChanged,
          res,
          parseUserAgent(req.headers['user-agent']),
        );
      }
    }

    if (!res.writableEnded) {
      if (context.filePath !== undefined) {
        debug(`sending "${context.filePath}"`);
        handleFile(context.filePath, req, res);
        return;
      }

      res.unhandled = true;

      if (this.applicationHost) {
        noisyInfo(`    allowing app to handle "${req.url}"`);
        this.applicationHost.handle(req, res);
      } else if (this.electronHost) {
        noisyInfo(`    allowing Electron app to handle "${req.url}"`);
        this.electronHost.handle(req, res);
      } else {
        // Reroute to root index.html
        if (context.type === 'html') {
          res.rerouted = req.url !== '/';
          req.url = '/';
          context = getContextForReq(req);
          context.filePath = find(req);

          if (context.filePath !== undefined) {
            debug(`sending "${context.filePath}"`);
            handleFile(context.filePath, req, res);
            return;
          }
        }

        debug(`not found "${req.url}"`);
        res.writeHead(404);
        res.end();
      }
    }
  }

  /**
   * Add "filePaths" to watcher
   */
  addWatchFiles(filePaths: string | Array<string>) {
    this.watcher.add(filePaths);
  }

  /**
   * Register new reload client connection
   *
   * @private
   */
  registerReloadClient(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse,
  ): void {
    const client = new EventSource(
      req,
      res as ServerResponse & Http2ServerResponse,
    );

    this.clients.add(client);
    debug('added reload connection', this.clients.size);

    client.on('close', () => {
      this.clients.delete(client);
      debug('removed reload connection', this.clients.size);
    });
  }

  /**
   * Destroy running server
   */
  async destroy(): Promise<void> {
    this.mocks?.clear();
    this.unlistenForFileRead();
    this.watcher.close();
    this.hooks.destroy();
    clearCachedResponses();
    clearContexts();
    clearImportMap();
    clearModuleGraph();

    for (const connection of this.connections.values()) {
      connection.destroy();
    }
    this.connections.clear();

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    await this.applicationHost?.destroy();
    this.electronHost?.destroy();

    return new Promise((resolve) => {
      if (!this.server) {
        return resolve();
      }

      debug('server stopped');
      this.server.removeAllListeners();
      if (!this.server.listening) {
        resolve();
      } else {
        this.server.close(() => {
          resolve();
        });
      }
    });
  }
}

/**
 * Determine if "req" is reload client connection
 */
function isReloadRequest(req: IncomingMessage | Http2ServerRequest) {
  return req.url && req.url.startsWith('/dvlp/reload');
}

/**
 * Resolve the contexts clients are notified with for changed "filePath".
 * A changed css dependency is routed to its root owner stylesheets via the
 * module graph, since clients match refresh events against root hrefs.
 */
function getReloadContexts(
  filePath: string,
): Array<{ type?: string; href: string }> {
  const context = getContextForFilePath(filePath);

  if (context === undefined) {
    return [{ type: undefined, href: filePath }];
  }

  if (context.type === 'css' && context.assert === undefined) {
    const ownerContexts = findModuleGraphOwners(
      filePath,
      (importer) => getContextForFilePath(importer)?.type === 'css',
    )
      .map(getContextForFilePath)
      .filter((owner) => owner !== undefined && owner.type === 'css');

    if (ownerContexts.length > 0) {
      return ownerContexts as Array<{ type?: string; href: string }>;
    }
  }

  return [context];
}
