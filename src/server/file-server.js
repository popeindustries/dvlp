import chalk from 'chalk';
import Debug from 'debug';
import { find } from '../utils/file.js';
import http from 'http';
import { info } from '../utils/log.js';
import { isHtmlRequest } from '../utils/is.js';
import send from 'send';

const debug = Debug('dvlp:fileserver');

/**
 * Create default file server instance
 */
export default function createFileServer() {
  // @ts-ignore
  http.createServer(createRequestHandler()).listen(process.env.PORT);
}

/**
 * Create request handler
 *
 * @returns { RequestHandler }
 */
function createRequestHandler() {
  return function requestHandler(req, res) {
    const url = req.url;

    res.once('finish', () => {
      const reroute = url !== req.url ? `(re-routed to ${chalk.green(req.url)})` : '';
      const duration = res.metrics.getEvent('response', true);

      info(
        res.statusCode < 300
          ? `${duration} handled request for ${chalk.green(url)} ${reroute}`
          : `${duration} [${res.statusCode}] unhandled request for ${chalk.red(url)} ${reroute}`,
      );
    });

    let filePath = find(req);

    // Re-write to root index.html
    if (!filePath && isHtmlRequest(req)) {
      // @ts-ignore
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
