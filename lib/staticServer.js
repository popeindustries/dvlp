'use strict';

const chockidar = require('chokidar');
const fs = require('fs');
const http = require('http');
const path = require('path');
const FileServer = require('node-static').Server;
const url = require('url');

const DEFAULT_PORT = 8080;

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ headers: object, port: number, reloadServer: object }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = function staticServer(
  webroot = process.cwd(),
  { headers = {}, port = DEFAULT_PORT, reloadServer } = {}
) {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd();
    const config = {
      cache: 0,
      headers
    };
    const directories = (Array.isArray(webroot) ? webroot : [webroot]).map((directory) => {
      // Paths must be relative to cwd
      return ~directory.indexOf(cwd) ? path.relative(cwd, directory) : directory;
    });
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
    const api = {
      /**
       * Destroy the active server
       */
      destroy() {
        try {
          server.close();
          if (watcher !== undefined) {
            watcher.close();
          }
        } catch (err) {
          // ignore
        }
      }
    };
    let watcher;

    if (reloadServer !== undefined) {
      watcher = watch(directories, reloadServer);
    }

    server.on('error', (err) => reject(err));
    server.on('listening', () => resolve(api));

    server.listen(port);
  });
};

/**
 * Watch 'directories' for changes
 * @param {array} directories
 * @param {{ refresh: (string) => void }} reloadServer
 * @returns {Watcher}
 */
function watch(directories, reloadServer) {
  const watcher = chockidar.watch(directories, {
    ignored: /(^|[/\\])\../,
    persistent: true
  });

  watcher.on('add', () => reloadServer.refresh());
  watcher.on('change', (filepath) => reloadServer.refresh(filepath));
  watcher.on('unlink', () => reloadServer.refresh());

  return watcher;
}
