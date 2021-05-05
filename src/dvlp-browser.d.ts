/// <reference path="_dvlp.d.ts" />

export namespace testBrowser {
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
   * Add mock response for "req"
   */
  function mockResponse(
    req: string | _dvlp.MockRequest,
    res?: _dvlp.MockResponse | _dvlp.MockResponseHandler,
    once?: boolean,
    onMockCallback?: () => void,
  ): () => void;
  /**
   * Push data to WebSocket/EventSource clients
   * A string passed as `event` will be handled as a named mock push event
   */
  function pushEvent(stream: string, event?: string | _dvlp.PushEvent): void;
}

declare global {
  interface Window {
    dvlp: typeof testBrowser;
  }
}
