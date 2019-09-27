declare module 'dvlp' {
  type ServerOptions = {
    mockPath?: string | Array<string>;
    port?: number;
    reload?: boolean;
    transpiler?: string;
  };

  type Server = {
    destroy(): () => Promise<void>;
  };

  type TestServerOptions = {
    autorespond?: boolean;
    latency?: number;
    port?: number;
    webroot?: string;
  };

  type MockRequest = {
    url: string;
    filePath: string;
    ignoreSearch?: boolean;
  };

  type MockResponse = {
    headers: { [key: string]: any };
    body: string | { [key: string]: any };
  };

  type MockPushStream = {
    url: string;
    filePath: string;
    type: string;
    ignoreSearch?: boolean;
    protocol?: string;
  };

  type MockPushEvent = {
    name: string;
    message?: string | { [key: string]: any };
    sequence?: Array<MockPushEvent>;
    options: {
      delay?: number;
      event?: string;
      id?: string;
    };
  };

  type PushStream = {
    url: string;
    type: string;
  };

  type PushEvent = {
    message: string | { [key: string]: any };
    options?: {
      event?: string;
      id?: string;
    };
  };

  class TestServer {
    constructor(options: TestServerOptions);

    /**
     * Load mock files at 'filePath'
     *
     * @param { string | Array<string> } filePath
     */
    loadMockFiles(filePath: string | Array<sttring>): void;

    /**
     * Register mock 'response' for 'request'
     *
     * @param { string | MockRequest } request
     * @param { MockResponse } response
     * @param { boolean } [once]
     */
    mockResponse(
      request: string | MockRequest,
      response: MockResponse,
      once?: boolean
    ): void;

    /**
     * Register mock push 'events' for 'stream'
     *
     * @param { string | MockPushStream } stream
     * @param { MockPushEvent | Array<MockPushEvent> } events
     */
    mockPushEvents(
      stream: string | MockPushStream,
      events: MockPushEvent | Array<MockPushEvent>
    ): void;

    /**
     * Push data to WebSocket/EventSource clients
     * A string passed as 'event' will be handled as a named mock push event
     *
     * @param { string | PushStream } stream
     * @param { string | PushEvent } [event]
     * @returns { void }
     */
    pushEvent(stream: string | PushStream, event?: string | PushEvent): void;

    /**
     * Destroy instance
     *
     * @returns { Promise<void> }
     */
    destroy(): Promise<void>;
  }

  /**
   * Create server
   *
   * @param { string } filePath
   * @param { ServerOptions } [options]
   * @returns { server }
   */
  function server(filePath: string, options?: ServerOptions): Server;

  /**
   * Create test server
   *
   * @param { TestServerOptions } [options]
   * @returns { TestServer }
   */
  function testServer(options: TestServerOptions): TestServer;

  /**
   * Disable all external network connections
   * and optionally reroute all external requests to this server
   *
   * @param { boolean } [rerouteAllRequests]
   * @returns { void }
   */
  function disableNetwork(rerouteAllRequests?: boolean): void;

  /**
   * Enable all external network connections
   *
   * @returns { void }
   */
  function enableNetwork(): void;

  testServer.disableNetwork = disableNetwork;
  testServer.enableNetwork = enableNetwork;
}
