import config from './config.js';
import { interceptClientRequest } from './utils/intercept-client-request.js';
import { isLocalhost } from './utils/is.js';
import log from './utils/log.js';
import { TestServer } from './test-server/index.js';

/** @type { Set<TestServer> } */
const instances = new Set();
let reroute = false;
let networkDisabled = false;
/** @type { () => void | undefined } */
let uninterceptClientRequest;

/**
 * Create test server
 *
 * @param { TestServerOptions } [options]
 * @returns { Promise<TestServer> }
 */
export async function testServer(options) {
  enableRequestIntercept();

  const server = new TestServer(options || {});

  // @ts-expect-error: private
  await server._start();

  // Force silent mode to suppress logging
  log.silent = true;

  instances.add(server);

  const originalDestroy = server.destroy;

  server.destroy = function destroy() {
    instances.delete(server);
    return originalDestroy.call(server);
  };

  return server;
}

/**
 * Disable all external network connections
 * and optionally reroute all external requests to this server
 *
 * @param { boolean } [rerouteAllRequests]
 * @returns { void }
 */
testServer.disableNetwork = function disableNetwork(
  rerouteAllRequests = false,
) {
  enableRequestIntercept();
  networkDisabled = true;
  reroute = rerouteAllRequests;
};

/**
 * Re-enable all external network connections
 *
 * @returns { void }
 */
testServer.enableNetwork = function enableNetwork() {
  uninterceptClientRequest?.();
  networkDisabled = false;
  reroute = false;
};

/**
 * Default mock response handler for network hang
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { undefined }
 */
testServer.mockHangResponseHandler = function mockHangResponseHandler(
  req,
  res,
) {
  return;
};

/**
 * Default mock response handler for 500 response
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { undefined }
 */
testServer.mockErrorResponseHandler = function mockErrorResponseHandler(
  req,
  res,
) {
  res.writeHead(500);
  res.error = Error('error');
  res.end('error');
  return;
};

/**
 * Default mock response handler for 404 response
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { undefined }
 */
testServer.mockMissingResponseHandler = function mockMissingResponseHandler(
  req,
  res,
) {
  res.writeHead(404);
  res.end('missing');
  return;
};

/**
 * Default mock response handler for offline
 *
 * @param { Req } req
 * @param { Res } res
 * @returns { undefined }
 */
testServer.mockOfflineResponseHandler = function mockOfflineResponseHandler(
  req,
  res,
) {
  req.socket.destroy();
  return;
};

/**
 * Enable request interception to allow mocking/network disabling
 */
function enableRequestIntercept() {
  if (uninterceptClientRequest === undefined) {
    uninterceptClientRequest = interceptClientRequest((url) => {
      const isMocked = Array.from(instances).some((instance) => {
        return instance.mocks.hasMatch(url);
      });
      const hostname = url.hostname || url.host;

      // Allow mocked requests to pass-through and be intercepted by mock/index.js
      if (!isMocked && !isLocalhost(hostname)) {
        if (reroute) {
          // Reroute back to this server
          url.protocol = 'http:';
          url.host = url.hostname = `localhost:${config.activePort}`;
          return true;
        } else if (networkDisabled) {
          throw Error(`network connections disabled. Unable to request ${url}`);
        }
      }

      return false;
    });
  }
}
