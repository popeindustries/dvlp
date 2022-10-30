declare interface TestServerOptions {
  /**
   * Enable/disable automatic dummy responses.
   * If unable to resolve a request to a local file or mock,
   * the server will respond with a dummy file of the appropriate type (default `true`).
   */
  autorespond?: boolean;
  /**
   * The amount of artificial latency to introduce (in `ms`) for responses (default `50`).
   */
  latency?: number;
  /**
   * The port to expose on `localhost`. Will use `process.env.PORT` if not specified here (default `8080`).
   */
  port?: number;
  /**
   * The subpath from `process.cwd()` to prepend to relative paths (default `''`).
   */
  webroot?: string;
}

declare class TestServer {
  latency: number;
  port: number;
  mocks: Mocks;
  webroot: string;
  constructor(options?: TestServerOptions);
  /**
   * Load mock files at `filePath`
   */
  loadMockFiles(filePath: string | Array<string>): void;
  /**
   * Register mock `response` for `request`.
   * If `once`, mock will be unregistered after first use.
   * If `onMock`, callback when response is mocked
   */
  mockResponse(
    request: string | MockRequest,
    response: MockResponse | MockResponseHandler,
    once?: boolean,
    onMockCallback?: () => void,
  ): void;
  /**
   * Register mock push `events` for `stream`
   */
  mockPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>,
  ): void;
  /**
   * Push data to WebSocket/EventSource clients
   * A string passed as `event` will be handled as a named mock push event
   */
  pushEvent(stream: string | PushStream, event?: string | PushEvent): void;
  /**
   * Clear all mock data
   */
  clearMockFiles(): void;
  /**
   * Destroy server instance
   */
  destroy(): Promise<void>;
}
