import type { Req, Res } from './types.ts';
import config from './config.ts';
import { interceptClientRequest } from './utils/intercept-client-request.ts';
import { isLocalhost } from './utils/is.ts';
import log from './utils/log.ts';
import { TestServer } from './test-server/index.ts';
import type { TestServerOptions } from './test-server/types.ts';

export { TestServer };
export type { Req, Res } from './types.ts';
export type { TestServerOptions } from './test-server/types.ts';

interface TestServerFactory {
  (options?: TestServerOptions): Promise<TestServer>;
  disableNetwork(rerouteAllRequests?: boolean): void;
  enableNetwork(): void;
  mockHangResponseHandler(req: Req, res: Res): void;
  mockErrorResponseHandler(req: Req, res: Res): void;
  mockMissingResponseHandler(req: Req, res: Res): void;
  mockOfflineResponseHandler(req: Req, res: Res): void;
}

const instances = new Set<TestServer>();
let reroute = false;
let networkDisabled = false;
let uninterceptClientRequest: (() => void) | undefined;

/**
 * Create test server
 */
export const testServer = async function testServer(
  options?: TestServerOptions,
): Promise<TestServer> {
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
} as TestServerFactory;

/**
 * Disable all external network connections
 * and optionally reroute all external requests to this server
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
 */
testServer.enableNetwork = function enableNetwork() {
  uninterceptClientRequest?.();
  networkDisabled = false;
  reroute = false;
};

/**
 * Default mock response handler for network hang
 */
testServer.mockHangResponseHandler = function mockHangResponseHandler(
  req,
  res,
) {
  return;
};

/**
 * Default mock response handler for 500 response
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
