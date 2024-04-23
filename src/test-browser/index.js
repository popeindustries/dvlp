// @ts-nocheck
import '../mock/mock-client.js';

export const testBrowser = {
  /**
   * Disable all external network connections
   * and optionally reroute all external requests to this server
   *
   * @param { boolean } [rerouteAllRequests]
   */
  disableNetwork(rerouteAllRequests) {
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
   *
   * @param { string | MockRequest } req
   * @param { MockResponse } [res]
   * @param { boolean } [once]
   * @param { () => void } [onMockCallback]
   * @returns { () => void } remove mock instance
   */
  mockResponse(req, res, once, onMockCallback) {
    return window.dvlp.mockResponse(req, res, once, onMockCallback);
  },
  /**
   * Register mock push "events" for "stream"
   *
   * @param { string | MockPushStream } stream
   * @param { MockPushEvent | Array<MockPushEvent> } events
   * @param { (data: any) => void } [onSendCallback]
   * @returns { () => void } remove mock instance
   */
  mockPushEvents(stream, events, onSendCallback) {
    return window.dvlp.mockPushEvents(stream, events, onSendCallback);
  },
  /**
   * Trigger EventSource/WebSocket event
   *
   * @param { string } stream
   * @param { string | { message: string | object, options: { event: string, id: string } } } event
   */
  pushEvent(stream, event) {
    return window.dvlp.pushEvent(stream, event);
  },
};
