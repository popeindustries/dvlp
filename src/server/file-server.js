'use strict';

const chalk = require('chalk');
const debug = require('debug')('dvlp:fileserver');
const { find } = require('../utils/file.js');
const http = require('http');
const { info } = require('../utils/log.js');
const { isHtmlRequest } = require('../utils/is.js');
const send = require('send');

/**
 * Create default file server instance
 */
module.exports = function createFileServer() {
  // @ts-ignore
  http.createServer(createRequestHandler()).listen(process.env.PORT);
};

/**
 * Create request handler
 *
 * @returns { RequestHandler }
 */
function createRequestHandler() {
  return function requestHandler(req, res) {
    const url = req.url;

    res.once('finish', () => {
      const reroute =
        url !== req.url ? `(re-routed to ${chalk.green(req.url)})` : '';
      const duration = res.metrics.getEvent('response', true);

      info(
        res.statusCode < 300
          ? `${duration} handled request for ${chalk.green(url)} ${reroute}`
          : `${duration} [${res.statusCode}] unhandled request for ${chalk.red(
              url,
            )} ${reroute}`,
      );
    });

    let filePath = find(req);

    // Re-write to root index.html
    if (!filePath && isHtmlRequest(req)) {
      req.url = '/';
      filePath = find(req);
    }

    if (!filePath) {
      debug(`not found "${req.url}"`);
      res.writeHead(404);
      return res.end();
    }

    debug(`sending "${filePath}"`);
    return send(req, filePath, {
      // Prevent caching of project files
      cacheControl: false,
      dotfiles: 'allow',
      etag: false,
      lastModified: false,
    }).pipe(res);
  };
}
