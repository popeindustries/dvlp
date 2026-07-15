import { connectClient, pushEvent } from '../push-events/index.ts';
import type { Req, Res } from '../types.ts';
import chalk from 'chalk';
import config from '../config.ts';
import { EventSource } from '../reload/event-source.ts';
import favicon from '../utils/favicon.ts';
import { find } from '../utils/file.ts';
import { fromBase64Url } from '../utils/base64Url.ts';
import type { Mocks } from '../mock/types.ts';
import { noisyInfo } from '../utils/log.ts';
import { send } from '../utils/send.ts';
// @ts-expect-error - no types
import WebSocket from 'faye-websocket';

const favIcon = Buffer.from(favicon, 'base64');

/**
 * Handle request for favicon
 * Returns 'true' if handled
 */
export function handleFavicon(req: Req, res: Res): boolean {
  if (req.url.includes('/favicon.ico')) {
    const customFavIcon = find(req);

    if (customFavIcon) {
      res.setHeader('Cache-Control', `public, max-age=${config.maxAge}`);
      send(customFavIcon, res, req);
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
 */
export function handleMockResponse(req: Req, res: Res, mocks?: Mocks): boolean {
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
    }

    // Matches and responds in a single pass, returning "false" if no match
    const handled = mocks.matchResponse(req.url, req, res);

    return handled === true;
  }

  return false;
}

/**
 * Handle mock WebSocket connection
 */
export function handleMockWebSocket(
  req: Req,
  socket: object,
  body: object,
  mocks: Mocks,
): void {
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
 */
export function handlePushEvent(req: Req, res: Res, mocks?: Mocks): boolean {
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
 */
export function handleFile(filePath: string, req: Req, res: Res): void {
  send(filePath, res, req);
}

/**
 * Handle request for data URL (?dvlpdata=)
 * Returns 'true' if handled
 */
export function handleDataUrl(req: Req, res: Res): boolean {
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
