'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const FileServer = require('node-static').Server;
const url = require('url');

const DEFAULT_PORT = 8080;

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ headers: object, port: number }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = function staticServer(
  webroot = process.cwd(),
  { headers = {}, port = DEFAULT_PORT } = {}
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

    server.on('error', (err) => {
      reject(err);
    });
    server.on('listening', () => {
      resolve({
        destroy() {
          try {
            server.close();
          } catch (err) {
            // ignore
          }
        }
      });
    });

    server.listen(port);
  });
};
