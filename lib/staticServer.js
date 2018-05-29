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
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }, rollupOptions: object }} [options]
 * @returns {{ destroy: () => Promise<void> }}
 */
module.exports = async function staticServer(
  webroot = process.cwd(),
  { port = DEFAULT_PORT, reload, rollupOptions } = {}
) {
  const cwd = process.cwd();
  const directories = (Array.isArray(webroot) ? webroot : [webroot]).map((directory) => {
    return directory.includes(cwd) ? path.relative(cwd, directory) : directory;
  });
  const instance = await factory(directories, port, reload, rollupOptions);

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
 * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }} [reload]
 * @param {object} [rollupOptions]
 * @returns {{ destroy: () => void }}
 */
async function factory(directories, port, reload, rollupOptions) {
  let watcher;

  if (reload) {
    watcher = watch((filepath) => {
      info(
        `[${new Date().toLocaleTimeString()}] ${chalk.yellow('changed')} ${path.basename(filepath)}`
      );
      reload.send(filepath);
    });
  }

  const server = await start(directories, port, reload, watcher, rollupOptions);

  return {
    destroy() {
      debug('destroying');
      watcher && watcher.close();
      return stop(server);
    }
  };
}

/**
 * Start server
 * @param {Array} directories
 * @param {number} port
 * @param {{ client: string, send: (string, object) => void, destroy: () => Promise<void> }} [reload]
 * @param {object} [watcher]
 * @param {object} [rollupOptions]
 * @returns {Promise<http.Server>}
 */
function start(directories, port, reload, watcher, rollupOptions) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      let filepath;

      try {
        // Triggers bundling
        filepath = await find(req, directories, rollupOptions);
      } catch (err) {
        debug(`not found "${req.url}"`);
        res.writeHead('404');
        return res.end();
      }

      patchRequest(req);
      patchResponse(req, res, reload && reload.client);
      watcher && watcher.add(filepath);

      debug(`sending "${filepath}"`);
      return send(req, filepath, {
        cacheControl: false,
        dotfiles: 'allow'
      }).pipe(res);
    });

    server.keepAliveTimeout = 0;
    serverDestroy(server);

    server.on('error', reject);
    server.on('listening', () => resolve(server));

    server.listen(port);
  });
}

/**
 * Stop running server
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function stop(server) {
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
