'use strict';

const { log } = require('./utils/log');
const { find } = require('./utils/file');
const { patchRequest, patchResponse } = require('./utils/patch');
const debug = require('debug')('dvlp:static');
const http = require('http');
const path = require('path');
const send = require('send');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ port: number, reloadServer: { refresh: (string) => void }}} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = async function staticServer(
  webroot = process.cwd(),
  { port = DEFAULT_PORT, reloadServer } = {}
) {
  const cwd = process.cwd();
  const directories = (Array.isArray(webroot) ? webroot : [webroot]).map((directory) => {
    return directory.includes(cwd) ? path.relative(cwd, directory) : directory;
  });
  const isReloading = reloadServer !== undefined;
  const server = await start(cwd, directories, port, isReloading, {
    cacheControl: false,
    // TODO: support passing headers
    headers: {}
  });
  let watcher;

  if (isReloading) {
    watcher = await watch(directories, (filepath) => {
      log(`  Change detected: "${path.basename(filepath)}"`);
      reloadServer.refresh(filepath);
    });
  }

  log(`  Serving "${directories.join(', ')}" at http://localhost:${port}`);

  return factory(server, watcher);
};

/**
 * Start server
 * @param {string} cwd
 * @param {Array} directories
 * @param {number} port
 * @param {boolean} isReloading
 * @param {object} config
 * @returns {Promise<http.Server>}
 */
function start(cwd, directories, port, isReloading, config) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const filepath = find(req, directories);

      if (!filepath) {
        debug(`not found "${req.url}"`);
        res.writeHead('404', config.headers);
        return res.end();
      }

      patchRequest(req);
      patchResponse(req, res, isReloading);

      debug(`sending "${filepath}"`);
      return send(req, filepath, config).pipe(res);
    });

    server.on('error', reject);
    server.on('listening', () => resolve(server));

    server.listen(port);
  });
}

/**
 * Factory for return instance
 * @returns {{ destroy: () => void }}
 */
function factory(server, watcher) {
  return {
    destroy() {
      debug('destroying');
      return new Promise((resolve) => {
        watcher && watcher.close();
        watcher = undefined;
        server &&
          server.close((err) => {
            server.removeAllListeners();
            server = undefined;
            if (err) {
              // ignore
            }
            resolve();
          });
      });
    }
  };
}
