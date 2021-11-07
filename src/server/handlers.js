import { connectClient, pushEvent } from '../push-events/index.js';
import chalk from 'chalk';
import config from '../config.js';
import { EventSource } from '../reload/event-source.js';
import favicon from '../utils/favicon.js';
import { find } from '../utils/file.js';
import { noisyInfo } from '../utils/log.js';
import send from 'send';
import { URL } from 'url';
import WebSocket from 'faye-websocket';

const favIcon = Buffer.from(favicon, 'base64');

/**
 * Handle request for favicon
 * Returns 'true' if handled
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { boolean }
 */
export function handleFavicon(req, res) {
  if (req.url.includes('/favicon.ico')) {
    const customFavIcon = find(req);

    if (customFavIcon) {
      send(req, customFavIcon, {
        cacheControl: true,
        maxAge: config.maxAge,
        etag: false,
        lastModified: false,
      }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': favIcon.length,
        'Cache-Control': `public, max-age=${config.maxAge}`,
        'Content-Type': 'image/x-icon;charset=UTF-8',
      });
      res.end(favIcon);
    }

    return true;
  }

  return false;
}

/**
 * Handle mock responses, including EventSource connection
 * Returns 'true' if handled
 *
 * @param { Req } req
 * @param { Res } res
 * @param { Mock } [mocks]
 * @returns { boolean }
 */
export function handleMockResponse(req, res, mocks) {
  if (mocks !== undefined) {
    const url = new URL(req.url, `http://localhost:${config.activePort}`);
    let mock = url.searchParams.get('dvlpmock');

    if (mock) {
      mock = decodeURIComponent(mock);

      if (EventSource.isEventSource(req)) {
        connectClient(
          {
            url: mock,
            type: 'es',
          },
          req,
          res,
        );
        // Send 'connect' event if it exists
        mocks.matchPushEvent(mock, 'connect', pushEvent);
        noisyInfo(`${chalk.green('     0ms')} connected to EventSource client at ${chalk.green(mock)}`);
      } else {
        mocks.matchResponse(mock, req, res);
      }

      return true;
    }
  }

  return false;
}

/**
 * Handle mock WebSocket connection
 *
 * @param { Req } req
 * @param { object } socket
 * @param { object } body
 * @param { Mock } [mocks]
 * @returns { void }
 */
export function handleMockWebSocket(req, socket, body, mocks) {
  if (mocks !== undefined) {
    const url = new URL(req.url, `http://localhost:${config.activePort}`);
    let mock = url.searchParams.get('dvlpmock');

    if (mock && WebSocket.isWebSocket(req)) {
      mock = decodeURIComponent(mock);
      connectClient(
        {
          url: mock,
          type: 'ws',
        },
        req,
        socket,
        body,
      );
      // Send 'connect' event if it exists
      mocks.matchPushEvent(mock, 'connect', pushEvent);
      noisyInfo(`${chalk.green('     0ms')} connected to WebSocket client at ${chalk.green(mock)}`);
    }
  }
}

/**
 * Handle push event request
 * Returns 'true' if handled
 *
 * @param { Req } req
 * @param { Res } res
 * @param { Mock } [mocks]
 * @returns { boolean }
 */
export function handlePushEvent(req, res, mocks) {
  if (mocks !== undefined) {
    if (req.method === 'POST' && req.url === '/dvlp/push-event') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const { stream, event } = JSON.parse(body);

        if (typeof event === 'string') {
          mocks.matchPushEvent(stream, event, pushEvent);
        } else {
          pushEvent(stream, event);
        }

        res.writeHead(200);
        res.end('ok');
      });

      return true;
    }
  }

  return false;
}
