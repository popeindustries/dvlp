'use strict';

const { find } = require('./utils/file');
const { info } = require('./utils/log');
const { patchRequest, patchResponse } = require('./utils/patch');
const chalk = require('chalk');
const debug = require('debug')('dvlp:static');
const eventSource = require('./utils/eventSource');
const http = require('http');
const path = require('path');
const send = require('send');
const watch = require('./utils/watch');

const DEFAULT_PORT = 8080;

/**
 * Create static server
 * @param {string|array} webroot
 * @param {{ port: number, reload: boolean, rollupOptions: object }} [options]
 * @returns {Promise<{ destroy: () => void }>}
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
 * @param {boolean} reload
 * @param {object} [rollupOptions]
 * @returns {{ destroy: () => void }}
 */
async function factory(directories, port, reload, rollupOptions) {
  let sse, watcher;

  if (reload) {
    sse = eventSource();
    watcher = watch((filepath) => {
      info(
        `[${new Date().toLocaleTimeString()}] ${chalk.yellow('changed')} ${path.basename(filepath)}`
      );
      // TODO: match filepath to req.url
      sse.send('reload', { filepath });
    });
  }

  const server = await start(directories, port, sse, watcher, rollupOptions);

  return {
    destroy() {
      debug('destroying');
      sse && sse.close();
      watcher && watcher.close();
      if (server) {
        server.removeAllListeners();
        server.close();
      }
    }
  };
}

/**
 * Start server
 * @param {Array} directories
 * @param {number} port
 * @param {object} [sse]
 * @param {object} [watcher]
 * @param {object} [rollupOptions]
 * @returns {Promise<http.Server>}
 */
function start(directories, port, sse, watcher, rollupOptions) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      let filepath;

      // Handle EventSource connection
      if (sse && sse.match(req)) {
        return sse.handle(req, res);
      }

      try {
        // Triggers bundling
        filepath = await find(req, directories, rollupOptions);
      } catch (err) {
        debug(`not found "${req.url}"`);
        res.writeHead('404');
        return res.end();
      }

      patchRequest(req);
      patchResponse(req, res, sse != null);
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
