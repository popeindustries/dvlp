/// <reference path="_dvlp.d.ts" />

export function server(
  filePath: string | Array<string> | (() => void),
  options?: _dvlp.ServerOptions,
): Promise<_dvlp.Server>;

export function testServer(options: _dvlp.TestServerOptions): Promise<_dvlp.TestServer>;

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
  function mockHangResponseHandler(url: URL, req: _dvlp.Req, res: _dvlp.Res): undefined;
  /**
   * Default mock response handler for 500 response
   */
  function mockErrorResponseHandler(url: URL, req: _dvlp.Req, res: _dvlp.Res): undefined;
  /**
   * Default mock response handler for 404 response
   */
  function mockMissingResponseHandler(url: URL, req: _dvlp.Req, res: _dvlp.Res): undefined;
  /**
   * Default mock response handler for offline
   */
  function mockOfflineResponseHandler(url: URL, req: _dvlp.Req, res: _dvlp.Res): undefined;
}
