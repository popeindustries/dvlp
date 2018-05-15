'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const FileServer = require('node-static').Server;
const url = require('url');
const watch = require('./watch');

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
    // Paths must be relative to cwd
    return ~directory.indexOf(cwd) ? path.relative(cwd, directory) : directory;
  });
  const server = await start(cwd, directories, port, {
    cache: 0,
    headers: {}
  });
  let watcher;

  if (reloadServer) {
    watcher = await watch(directories, (filepath) => {
      reloadServer.refresh(filepath);
    });
  }

  return factory(server, watcher);
};

/**
 * Start server
 * @param {string} cwd
 * @param {Array} directories
 * @param {number} port
 * @param {object} config
 * @returns {Promise<http.Server>}
 */
function start(cwd, directories, port, config) {
  return new Promise((resolve, reject) => {
    const fileServer = new FileServer(cwd, config);
    const server = http.createServer((req, res) => {
      let uri = url.parse(req.url, true).pathname;
      const isFile = !!path.extname(uri).length;

      if (!isFile) {
        uri = path.join(uri, 'index.html');
      }

      for (const directory of directories) {
        const filepath = path.join(directory, uri);

        if (fs.existsSync(filepath)) {
          return fileServer.serveFile(filepath, 200, {}, req, res);
        }
      }

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
      return new Promise((resolve) => {
        watcher && watcher.close();
        watcher = undefined;
        server.close((err) => {
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
