import { Hooks, Req, Res, Server, ServerOptions, TestServer, TestServerOptions } from './_dvlp';

export { Hooks };

export function server(filePath: string | Array<string> | (() => void), options?: ServerOptions): Promise<Server>;

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
