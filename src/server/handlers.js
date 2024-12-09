import { connectClient, pushEvent } from '../push-events/index.js';
import chalk from 'chalk';
import config from '../config.js';
import { EventSource } from '../reload/event-source.js';
import favicon from '../utils/favicon.js';
import { find } from '../utils/file.js';
import { fromBase64Url } from '../utils/base64Url.js';
import { noisyInfo } from '../utils/log.js';
import { send } from '../utils/send.js';
// @ts-expect-error - no types
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
      res.setHeader('Cache-Coontrol', `public, max-age=${config.maxAge}`);
      send(customFavIcon, res);
    } else {
      res.writeHead(200, {
        'Content-Length': favIcon.length,
        'Cache-Control': `public, max-age=${60 * 10}`,
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
 * @param { Mocks } [mocks]
 * @returns { boolean }
 */
export function handleMockResponse(req, res, mocks) {
  if (mocks !== undefined) {
    const url = new URL(req.url, `http://localhost:${config.activePort}`);
    let mockParam = url.searchParams.get('dvlpmock');

    if (mockParam) {
      mockParam = decodeURIComponent(mockParam);

      if (EventSource.isEventSource(req)) {
        connectClient(
          {
            url: mockParam,
            type: 'es',
          },
          req,
          res,
        );
        // Send 'connect' event if it exists
        mocks.matchPushEvent(mockParam, 'connect', pushEvent);
        noisyInfo(
          `${chalk.green(
            '    0ms',
          )} connected to EventSource client at ${chalk.green(mockParam)}`,
        );
      } else {
        mocks.matchResponse(mockParam, req, res);
      }

      return true;
    } else if (mocks.hasMatch(req)) {
      const handled = mocks.matchResponse(req.url, req, res);

      return handled === true;
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
 * @param { Mocks } mocks
 * @returns { void }
 */
export function handleMockWebSocket(req, socket, body, mocks) {
  const url = new URL(req.url, `http://localhost:${config.activePort}`);
  let mockPath = url.searchParams.get('dvlpmock');

  if (mockPath && WebSocket.isWebSocket(req)) {
    mockPath = decodeURIComponent(mockPath);
    connectClient(
      {
        url: mockPath,
        type: 'ws',
      },
      req,
      socket,
      body,
    );
    // Send 'connect' event if it exists
    mocks.matchPushEvent(mockPath, 'connect', pushEvent);
    noisyInfo(
      `${chalk.green(
        '    0ms',
      )} connected to WebSocket client at ${chalk.green(mockPath)}`,
    );
  }
}

/**
 * Handle push event request
 * Returns 'true' if handled
 *
 * @param { Req } req
 * @param { Res } res
 * @param { Mocks } [mocks]
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

/**
 * Handle file request
 *
 * @param { string } filePath
 * @param { Res } res
 */
export function handleFile(filePath, res) {
  send(filePath, res);
}

/**
 * Handle request for data URL (?dvlpdata=)
 * Returns 'true' if handled
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { boolean }
 */
export function handleDataUrl(req, res) {
  const url = new URL(req.url, `http://localhost:${config.activePort}`);
  const data = url.searchParams.get('dvlpdata');

  if (data) {
    const html = fromBase64Url(data);

    if (!res.hasHeader('Access-Control-Allow-Origin')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(html, 'utf-8'),
      'Content-Type': 'text/html;charset=UTF-8',
    });
    res.end(html);

    return true;
  }

  return false;
}
