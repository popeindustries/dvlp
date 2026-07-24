// @ts-nocheck - browser code
import '../mock/mock-client.js';
import type {
  MockedResponse,
  MockPushEvent,
  MockPushStream,
  MockRequest,
  MockResponse,
  MockResponseHandler,
} from '../mock/types.ts';
import type { MockStream, MockStreamOptions } from './types.ts';

export const testBrowser = {
  /**
   * Disable all external network connections
   * and optionally reroute all external requests to this server
   */
  disableNetwork(rerouteAllRequests?: boolean): void {
    return window.dvlp.disableNetwork(rerouteAllRequests);
  },
  /**
   * Re-enable all external network connections
   */
  enableNetwork(): void {
    return window.dvlp.enableNetwork();
  },
  /**
   * Add mock response for "req".
   * Returns a handle that removes the mock when called,
   * and exposes matched requests via its "calls" array.
   */
  mockResponse(
    req: string | MockRequest,
    res?: MockResponse | MockResponseHandler,
    once?: boolean,
    onMockCallback?: () => void,
  ): MockedResponse {
    return window.dvlp.mockResponse(req, res, once, onMockCallback);
  },
  /**
   * Register a mock stream at "url", returning a handle exposing live
   * connections for request/reply, per-connection send, and close
   */
  mockStream(url: string, options?: MockStreamOptions): MockStream {
    return window.dvlp.mockStream(url, options);
  },
  /**
   * Register mock push "events" for "stream"
   */
  mockPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>,
    onSendCallback?: (data: any) => void,
  ): () => void {
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
  ): Promise<void> {
    return window.dvlp.pushEvent(stream, event);
  },
};
