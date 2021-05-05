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
    return window._dvlp.disableNetwork(rerouteAllRequests);
  },
  /**
   * Re-enable all external network connections
   */
  enableNetwork() {
    return window._dvlp.enableNetwork();
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
    return window._dvlp.mockResponse(req, res, once, onMockCallback);
  },
  /**
   * Trigger EventSource/WebSocket event
   *
   * @param { string } stream
   * @param { string | { message: string | object, options: { event: string, id: string } } } event
   */
  pushEvent(stream, event) {
    return window._dvlp.pushEvent(stream, event);
  },
};
