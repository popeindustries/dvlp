import { Req, Res, TestServer, TestServerOptions } from './dvlp';

export { Req, Res, TestServer, TestServerOptions };

/**
 * Factory for creating `TestServer` instances
 */
export function testServer(options: TestServerOptions): Promise<TestServer>;

export namespace testServer {
  /**
   * Disable all external network connections,
   * and optionally reroute all external requests to this server with `rerouteAllRequests=true`
   */
  function disableNetwork(rerouteAllRequests?: boolean): void;
  /**
   * Re-enable all external network connections
   */
  function enableNetwork(): void;
  /**
   * Default mock response handler for network hang
   */
  function mockHangResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for 500 response
   */
  function mockErrorResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for 404 response
   */
  function mockMissingResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for offline
   */
  function mockOfflineResponseHandler(url: URL, req: Req, res: Res): undefined;
}
