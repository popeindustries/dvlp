import { concatScripts, getDvlpGlobalString, getProcessEnvString, hashScript } from '../utils/scripts.js';
import { error, info, noisyInfo } from '../utils/log.js';
import { find, getProjectPath, getTypeFromPath, getTypeFromRequest } from '../utils/file.js';
import { handleFavicon, handleFile, handleMockResponse, handleMockWebSocket, handlePushEvent } from './handlers.js';
import { isBundledFilePath, isHtmlRequest, isNodeModuleFilePath } from '../utils/is.js';
import { resolveCerts, validateCert } from './certificate-validation.js';
import chalk from 'chalk';
import config from '../config.js';
import Debug from 'debug';
import { EventSource } from '../reload/event-source.js';
import fs from 'fs';
import { getReloadClientEmbed } from '../reload/reload-client-embed.js';
import Hooker from '../hooks/index.js';
import http from 'http';
import http2 from 'http2';
import { interceptFileRead } from '../utils/intercept.js';
import Metrics from '../utils/metrics.js';
import Mock from '../mock/index.js';
import { parseUserAgent } from '../utils/platform.js';
import { patchResponse } from '../utils/patch.js';
import watch from '../utils/watch.js';

const debug = Debug('dvlp:server');

export default class DvlpServer {
  /**
   * Constructor
   *
   * @param { Entry } entry
   * @param { number } port
   * @param { boolean } reload
   * @param { Hooks } [hooks]
   * @param { string | Array<string> } [mockPath]
   * @param { string | Array<string> } [certsPath]
   */
  constructor(entry, port, reload = false, hooks, mockPath, certsPath) {
    // Listen for all upcoming file system reads
    // Register early to catch all reads, including transformers that patch fs.readFile
    this.watcher = this.createWatcher();
    this.unlistenForFileRead = interceptFileRead((filePath) => {
      this.addWatchFiles(filePath);
    });

    this.certsPath = certsPath;
    /** @type { Set<EventSource> } */
    this.clients = new Set();
    this.connections = new Map();
    this.entry = entry;
    this.hooks = new Hooker(hooks, this.watcher);
    this.lastChanged = '';
    /** @type { Http2SecureServerOptions } */
    this.secureServerOptions;

    if (certsPath) {
      const serverOptions = resolveCerts(certsPath);
      const commonName = validateCert(serverOptions.cert);

      if (commonName) {
        this.origin = `https://${commonName}`;
      }
      this.secureServerOptions = { allowHTTP1: true, ...serverOptions };
    } else {
      this.origin = `http://localhost:${port}`;
    }

    // Make sure mocks instance has access to active port
    this.port = config.activePort = port;
    this.mocks = mockPath ? new Mock(mockPath) : undefined;
    this.reload = reload;
    /** @type { Map<string, string> } */
    this.urlToFilePath = new Map();
    this.requestHandler = this.requestHandler.bind(this);
    /** @type { HttpServer | Http2SecureServer } */
    this.server;

    const headerScript = concatScripts([
      getProcessEnvString(),
      getDvlpGlobalString(),
      (this.mocks && this.mocks.client) || '',
    ]);
    const reloadEmbed = reload ? getReloadClientEmbed(port) : '';

    /** @type { PatchResponseOptions } */
    this.patchResponseOptions = {
      footerScript: {
        hash: hashScript(reloadEmbed),
        string: reloadEmbed,
        url: reload ? `/${config.reloadEndpoint}` : '',
      },
      headerScript: {
        hash: hashScript(headerScript),
        string: headerScript,
      },
      resolveImport: this.hooks.resolveImport,
      send: this.hooks.send,
    };
  }

  /**
   * Create watcher instance and react to file changes
   *
   * @returns { Watcher }
   */
  createWatcher() {
    return watch(async (filePath) => {
      noisyInfo(`\n  ⏱  ${new Date().toLocaleTimeString()} ${chalk.yellow(getProjectPath(filePath))}`);

      this.lastChanged = filePath;

      try {
        for (const [url, fp] of this.urlToFilePath) {
          if (fp === filePath) {
            filePath = url;
            break;
          }
        }

        // Will trigger one of:
        // 1. single css refresh if css and a link.href matches filePath
        // 2. multiple css refreshes if css and no link.href matches filePath (ie. it's a dependency)
        // 3. full page reload
        this.reload && this.send(filePath);
      } catch (err) {
        error(err);
      }
    });
  }

  /**
   * Add "filePaths" to watcher
   *
   * @param { string | Array<string> } filePaths
   */
  addWatchFiles(filePaths) {
    if (!Array.isArray(filePaths)) {
      filePaths = [filePaths];
    }

    for (const filePath of filePaths) {
      if (!isNodeModuleFilePath(filePath)) {
        this.watcher.add(filePath);
      }
    }
  }

  /**
   * Start app server
   * Proxies createServer to grab instance and register for events
   *
   * @returns { Promise<void> }
   */
  start() {
    return new Promise((resolve, reject) => {
      if (this.entry.isSecure) {
        this.server = http2.createSecureServer(this.secureServerOptions, this.requestHandler);
        this.server.setTimeout(0);
      } else {
        this.server = http.createServer(this.requestHandler);
        this.server.timeout = this.server.keepAliveTimeout = 0;
      }

      this.server.on('error', reject);
      this.server.on('listening', () => {
        debug('server started');
        resolve();
      });
      this.server.on('connection', (connection) => {
        const key = `${connection.remoteAddress}:${connection.remotePort}`;

        this.connections.set(key, connection);
        connection.on('close', () => {
          this.connections.delete(key);
        });
      });
      this.server.on('upgrade', (req, socket, body) => {
        handleMockWebSocket(/** @type { Req } */ (req), socket, body, this.mocks);
      });

      this.server.listen(this.port);
    });
  }

  /**
   * Handle incoming request
   *
   * @param { IncomingMessage | Http2ServerRequest } request
   * @param { ServerResponse | Http2ServerResponse } response
   */
  async requestHandler(request, response) {
    const req = /** @type { Req } */ (request);
    const res = /** @type { Res } */ (response);
    const { url } = req;

    if (isReloadRequest(req)) {
      this.registerClient(req, res);
      return;
    }

    res.metrics = new Metrics(res);

    res.once('finish', () => {
      if (!res.unhandled) {
        const duration = res.metrics.getEvent('response', true);
        const modifier = res.bundled ? ' bundled ' : res.mocked ? ' mocked ' : res.transformed ? ' transformed ' : ' ';
        let url = getProjectPath(req.url);

        if (res.mocked) {
          // Decode query param and strip "?dvlpmock=" prefix (sometimes double encoded if coming from client)
          url = decodeURIComponent(decodeURIComponent(url.slice(url.indexOf('?dvlpmock=') + 10)));
        }

        const msg = `${duration} handled${chalk.italic(modifier)}request for ${chalk.green(url)}`;

        res.mocked ? noisyInfo(msg) : info(msg);
      } else {
        // TODO: handle app response
        const reroute = res.rerouted ? `(re-routed to ${chalk.green(req.url)})` : '';
        const duration = res.metrics.getEvent('response', true);

        info(
          res.statusCode < 300
            ? `${duration} handled request for ${chalk.green(url)} ${reroute}`
            : `${duration} [${res.statusCode}] unhandled request for ${chalk.red(url)} ${reroute}`,
        );
      }
    });

    const type = getTypeFromRequest(req);
    let filePath = this.urlToFilePath.get(req.url);

    res.url = req.url;

    if (handleFavicon(req, res) || handleMockResponse(req, res, this.mocks) || handlePushEvent(req, res, this.mocks)) {
      return;
    }

    // Allow manual response handling via user hook
    if (await this.hooks.handleRequest(req, res)) {
      return;
    }

    // Ignore html or uncached or no longer available at previously known path
    if (type !== 'html' && (!filePath || !fs.existsSync(filePath))) {
      filePath = find(req, { type });

      if (filePath) {
        this.addWatchFiles(filePath);
        this.urlToFilePath.set(req.url, filePath);
      } else {
        // File not found. Clear previously known path
        this.urlToFilePath.delete(req.url);
      }
    }

    // Ignore unknown types
    if (type) {
      patchResponse(filePath, req, res, this.patchResponseOptions);
    }

    if (filePath) {
      if (isBundledFilePath(filePath)) {
        // Will write new file to disk
        await this.hooks.bundleDependency(filePath, res);
      }
      // Transform all files that aren't bundled or node_modules
      // This ensures that all symlinked workspace files are transformed even though they are dependencies
      if (!isNodeModuleFilePath(filePath)) {
        // Will respond if transformer exists for this type
        await this.hooks.transform(filePath, this.lastChanged, res, parseUserAgent(req.headers['user-agent']));
      }
    }

    if (!res.finished) {
      if (filePath) {
        debug(`sending "${filePath}"`);
        handleFile(filePath, req, res, true);
        return;
      }

      res.unhandled = true;

      if (this.entry.isStatic) {
        // Reroute to root index.html
        if (isHtmlRequest(req)) {
          res.rerouted = true;
          // @ts-ignore
          req.url = '/';
          filePath = find(req);
        }

        if (filePath) {
          debug(`sending "${filePath}"`);
          handleFile(filePath, req, res, false);
          return;
        }

        debug(`not found "${req.url}"`);
        res.writeHead(404);
        res.end();
        return;
      } else {
        noisyInfo(`  allowing app to handle "${req.url}"`);
        // send to application server
      }
    }
  }

  /**
   * Register new client connection
   *
   * @param { IncomingMessage | Http2ServerRequest } req
   * @param { ServerResponse | Http2ServerResponse } res
   * @returns { void }
   */
  registerClient(req, res) {
    const client = new EventSource(req, res);

    this.clients.add(client);
    debug('added reload connection', this.clients.size);

    client.on('close', () => {
      this.clients.delete(client);
      debug('removed reload connection', this.clients.size);
    });
  }

  /**
   * Send refresh/reload message to clients for changed 'filePath'
   *
   * @param { string } filePath
   * @returns { void }
   */
  send(filePath) {
    const type = getTypeFromPath(filePath);
    const event = type === 'css' ? 'refresh' : 'reload';
    const data = JSON.stringify({ type, filePath });

    if (this.clients.size) {
      noisyInfo(`${chalk.yellow(`  ⟲ ${event}ing`)} ${this.clients.size} client${this.clients.size > 1 ? 's' : ''}`);

      for (const client of this.clients) {
        client.send(data, { event });
      }
    }
  }

  /**
   * Destroy running server
   *
   * @returns { Promise<void> }
   */
  destroy() {
    this.mocks && this.mocks.clear();
    this.unlistenForFileRead();
    this.watcher.close();
    this.hooks.destroy();

    for (const connection of this.connections.values()) {
      connection.destroy();
    }
    this.connections.clear();

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    return new Promise(async (resolve) => {
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
 * Determine if "req" should be handled by reload server
 *
 * @param { IncomingMessage | Http2ServerRequest } req
 */
function isReloadRequest(req) {
  return req.url && req.url.startsWith(config.reloadEndpoint);
}
