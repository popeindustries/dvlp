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
   * @param { MockResponse } res
   * @param { boolean } [once]
   * @returns { () => void } remove mock instance
   */
  addResponse(req, res, once) {
    return window.dvlp.addResponse(req, res, once);
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
