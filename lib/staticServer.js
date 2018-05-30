'use strict';

const { find } = require('./utils/file');
const { info } = require('./utils/log');
const { patchRequest, patchResponse } = require('./utils/patch');
const chalk = require('chalk');
const debug = require('debug')('dvlp:static');
const http = require('http');
const path = require('path');
const send = require('send');
const serverDestroy = require('server-destroy');
const transpile = require('./utils/transpile');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ port: number, reloader: { client: string, send: (string, object) => void, destroy: () => Promise<void> }, rollupConfig: object, transpiler: (string) => string }} [options]
 * @returns {{ destroy: () => Promise<void> }}
 */
module.exports = async function staticServer(
  webroot = process.cwd(),
  { port = DEFAULT_PORT, reloader, rollupConfig, transpiler } = {}
) {
  const cwd = process.cwd();
  const directories = (Array.isArray(webroot) ? webroot : [webroot]).map((directory) => {
    return directory.includes(cwd) ? path.relative(cwd, directory) : directory;
  });
  const instance = await factory(directories, port, reloader, rollupConfig, transpiler);

  info(
    `Serving ${chalk.green(
      directories.map((dir) => dir || 'project').join(', ')
    )} at ${chalk.green.underline(`http://localhost:${port}`)}`
  );

  return instance;
};

/**
 * Factory for return instance
 * @param {[string]} directories
 * @param {number} port
 * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }} [reloader]
 * @param {object} [rollupConfig]
 * @param {(string) => string} [transpiler]
 * @returns {{ destroy: () => void }}
 */
async function factory(directories, port, reloader, rollupConfig, transpiler) {
  const state = {
    directories,
    filepathToTranspiled: new Map(),
    lastChanged: '',
    port,
    reloader,
    rollupConfig,
    server: null,
    transpiler,
    watcher: null
  };

  if (reloader) {
    createWatcher(state);
  }

  await start(state);

  return {
    destroy() {
      debug('destroying');
      state.watcher && state.watcher.close();
      return stop(state);
    }
  };
}

/**
 * Create watcher instance and listen for file changes
 * @param {object} state
 */
function createWatcher(state) {
  state.watcher = watch((filepath) => {
    info(
      `[${new Date().toLocaleTimeString()}] ${chalk.yellow('changed')} ${path.basename(filepath)}`
    );
    state.lastChanged = filepath;
    state.reloader.send(filepath);
  });
}

/**
 * Start server
 * @param {object} state
 * @returns {Promise<void>}
 */
function start(state) {
  const { directories, port, reloader, rollupConfig, transpiler, watcher } = state;

  return new Promise((resolve, reject) => {
    const server = (state.server = http.createServer(async (req, res) => {
      let filepath;

      try {
        // Triggers bundling
        filepath = await find(req, directories, rollupConfig);
      } catch (err) {
        debug(`not found "${req.url}"`);
        res.writeHead('404');
        return res.end();
      }

      patchRequest(req);
      patchResponse(req, res, reloader && reloader.client);
      watcher && watcher.add(filepath);
      transpiler && (await transpile(filepath, res, state));

      // Not transpiled
      if (!res.finished) {
        debug(`sending "${filepath}"`);
        return send(req, filepath, {
          cacheControl: false,
          dotfiles: 'allow'
        }).pipe(res);
      }
    }));

    server.keepAliveTimeout = 0;
    serverDestroy(server);

    server.on('error', reject);
    server.on('listening', resolve);

    server.listen(port);
  });
}

/**
 * Stop running server
 * @param {object} state
 * @returns {Promise<void>}
 */
function stop(state) {
  const { server } = state;

  return new Promise((resolve) => {
    if (!server) {
      return resolve();
    }

    server.removeAllListeners();
    server.destroy(() => {
      debug('server stopped');
      resolve();
    });
  });
}
