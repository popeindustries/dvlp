// @ts-nocheck - browser code
import '../mock/mock-client.js';
import type {
  MockPushEvent,
  MockPushStream,
  MockRequest,
  MockResponse,
} from '../mock/types.ts';

export const testBrowser = {
  /**
   * Disable all external network connections
   * and optionally reroute all external requests to this server
   */
  disableNetwork(rerouteAllRequests?: boolean) {
    return window.dvlp.disableNetwork(rerouteAllRequests);
  },
  /**
   * Re-enable all external network connections
   */
  enableNetwork() {
    return window.dvlp.enableNetwork();
  },
  /**
   * Add mock response for "req"
   */
  mockResponse(
    req: string | MockRequest,
    res?: MockResponse,
    once?: boolean,
    onMockCallback?: () => void,
  ) {
    return window.dvlp.mockResponse(req, res, once, onMockCallback);
  },
  /**
   * Register mock push "events" for "stream"
   */
  mockPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>,
    onSendCallback?: (data: any) => void,
  ) {
    return window.dvlp.mockPushEvents(stream, events, onSendCallback);
  },
  /**
   * Trigger EventSource/WebSocket event
   */
  pushEvent(
    stream: string,
    event:
      | string
      | { message: string | object; options: { event: string; id: string } },
  ) {
    return window.dvlp.pushEvent(stream, event);
  },
};
