import {
  MockPushEvent,
  MockPushStream,
  MockRequest,
  MockResponse,
  MockResponseHandler,
  PushEvent,
} from './dvlp.js';

export {
  MockPushEvent,
  MockPushStream,
  MockRequest,
  MockResponse,
  MockResponseHandler,
  PushEvent,
};

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
    req: string | MockRequest,
    res?: MockResponse | MockResponseHandler,
    once?: boolean,
    onMockCallback?: () => void,
  ): () => void;
  /**
   * Register mock push "events" for "stream"
   */
  function mockPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>,
    onSendCallback?: (data: any) => void,
  ): () => void;
  /**
   * Push data to WebSocket/EventSource clients
   * A string passed as `event` will be handled as a named mock push event
   */
  function pushEvent(stream: string, event?: string | PushEvent): void;
}

declare global {
  interface Window {
    dvlp: typeof testBrowser;
  }
}
