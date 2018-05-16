'use strict';

const { INJECTED_SCRIPT_LENGTH, injectReloadScript, log, watch } = require('./utils');
const debug = require('debug')('dvlp:static');
const fs = require('fs');
const http = require('http');
const path = require('path');
const send = require('send');
const url = require('url');

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
      let uri = url.parse(req.url, true).pathname;
      const isFile = !!path.extname(uri).length;

      if (!isFile) {
        uri = path.join(uri, 'index.html');
      }

      for (const directory of directories) {
        const filepath = path.join(directory, uri);

        if (fs.existsSync(filepath)) {
          const stream = send(req, filepath, config);

          if (isReloading && path.extname(uri) === '.html') {
            debug(`handling html request for "${req.url}"`);

            // Manually override length to account for injected
            const length = fs.statSync(filepath).size + INJECTED_SCRIPT_LENGTH;

            stream.once('stream', () => {
              res.setHeader('Content-Length', length);
            });

            injectReloadScript(res);
          }

          debug('sending', filepath);
          return stream.pipe(res);
        }
      }

      debug('not found', uri);
      res.writeHead('404', config.headers);
      res.end();
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
