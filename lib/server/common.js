'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 * @typedef { import("http").ServerResponse } ServerResponse
 * @typedef { import("../mock/index.js") } Mock
 */

const chalk = require('chalk');
const config = require('../config.js');
const { connectClient, pushEvent } = require('../push-events/index.js');
const { info } = require('../utils/log.js');
const stopwatch = require('../utils/stopwatch.js');
const { URL } = require('url');
const WebSocket = require('faye-websocket');

const { EventSource } = WebSocket;

module.exports = {
  handleMockResponse,
  handleMockWebSocket,
  handlePushEvent
};

/**
 * Handle mock responses, including EventSource connection
 * Returns 'true' if handled
 *
 * @param { ClientRequest } req
 * @param { ServerResponse } res
 * @param { Mock } mocks
 * @returns { boolean }
 */
function handleMockResponse(req, res, mocks) {
  const url = new URL(req.url, `http://localhost:${config.activePort}`);
  let mock = url.searchParams.get('dvlpmock');

  if (mocks && mock) {
    mock = decodeURIComponent(mock);

    if (EventSource.isEventSource(req)) {
      connectClient(
        {
          url: mock,
          type: 'es'
        },
        req,
        res
      );
      // Send 'connect' event if it exists
      mocks.matchPushEvent(mock, 'connect', pushEvent);
      info(
        `${stopwatch.stop(
          req.url,
          true,
          true
        )} connected to EventSource client at ${chalk.green(mock)}`
      );
    } else {
      mocks.matchResponse(mock, res);
    }

    return true;
  }

  return false;
}

/**
 * Handle mock WebSocket connection
 *
 * @param { ClientRequest } req
 * @param { object } socket
 * @param { object } body
 * @param { Mock } mocks
 * @returns { void }
 */
function handleMockWebSocket(req, socket, body, mocks) {
  const url = new URL(req.url, `http://localhost:${config.activePort}`);
  let mock = url.searchParams.get('dvlpmock');

  if (mocks && mock && WebSocket.isWebSocket(req)) {
    mock = decodeURIComponent(mock);
    connectClient(
      {
        url: mock,
        type: 'ws'
      },
      req,
      socket,
      body
    );
    // Send 'connect' event if it exists
    mocks.matchPushEvent(mock, 'connect', pushEvent);
    info(
      `${stopwatch.stop(
        req.url,
        true,
        true
      )} connected to WebSocket client at ${chalk.green(mock)}`
    );
  }
}

/**
 * Handle push event request
 * Returns 'true' if handled
 *
 * @param { ClientRequst } req
 * @param { ServerResponse } res
 * @param { Mock } mocks
 * @returns { boolean }
 */
function handlePushEvent(req, res, mocks) {
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

  return false;
}
