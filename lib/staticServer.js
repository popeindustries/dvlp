'use strict';

const { find } = require('./utils/file');
const { info } = require('./utils/log');
const { patchRequest, patchResponse } = require('./utils/patch');
const chalk = require('chalk');
const debug = require('debug')('dvlp:static');
const http = require('http');
const path = require('path');
const send = require('send');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ port: number, reloadServer: { refresh: (string) => void }, rollupOptions: object }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function staticServer(
  webroot = process.cwd(),
  { port = DEFAULT_PORT, reloadServer, rollupOptions } = {}
) {
  const cwd = process.cwd();
  const directories = (Array.isArray(webroot) ? webroot : [webroot]).map((directory) => {
    return directory.includes(cwd) ? path.relative(cwd, directory) : directory;
  });
  const instance = await factory(directories, port, reloadServer, rollupOptions);

  info(
    `Serving ${chalk.green(
      directories.map((dir) => dir || 'project').join(', ')
    )} at ${chalk.green.underline(`http://localhost:${port}`)}`
  );

  return instance;
};

/**
 * Factory for return instance
 * @returns {{ destroy: () => void }}
 */
async function factory(directories, port, reloadServer, rollupOptions) {
  const isReloading = reloadServer !== undefined;
  const reloadPort = reloadServer ? reloadServer.port : undefined;
  let watcher;

  if (isReloading) {
    watcher = watch((filepath) => {
      info(
        `[${new Date().toLocaleTimeString()}] ${chalk.yellow('changed')} ${path.basename(filepath)}`
      );
      reloadServer.refresh(filepath);
    });
  }

  const server = await start(
    directories,
    port,
    watcher,
    { isReloading, reloadPort },
    rollupOptions
  );

  return {
    destroy() {
      debug('destroying');
      return new Promise((resolve) => {
        watcher && watcher.close();
        server &&
          server.close((err) => {
            server.removeAllListeners();
            if (err) {
              // ignore
            }
            resolve();
          });
      });
    }
  };
}

/**
 * Start server
 * @param {Array} directories
 * @param {number} port
 * @param {object} [watcher]
 * @param {{ isReloading: boolean, reloadPort: number }} [reloadOptions]
 * @param {object} [rollupOptions]
 * @returns {Promise<http.Server>}
 */
function start(directories, port, watcher, reloadOptions, rollupOptions) {
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
      patchResponse(req, res, reloadOptions);
      watcher && watcher.add(filepath);

      debug(`sending "${filepath}"`);
      return send(req, filepath, {
        cacheControl: false,
        dotfiles: 'allow'
      }).pipe(res);
    });

    server.on('error', reject);
    server.on('listening', () => resolve(server));

    server.listen(port);
  });
}
