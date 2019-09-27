import { IncomingMessage, OutgoingMessage } from 'http';

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
  body: string | { [key: string]: any };
  hang?: boolean;
  headers?: { [key: string]: any };
  error?: boolean;
  missing?: boolean;
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

class Mock {
  cache: Map<string, object>;

  constructor(filePaths?: string | Array<string>);

  /**
   * Add new mock for 'res'
   *
   * @param { string | MockRequest } req
   * @param { MockResponse } res
   * @param { boolean } [once]
   */
  addResponse(
    req: string | MockRequest,
    res: MockResponse,
    once?: boolean
  ): void;

  /**
   * Add new push mock for 'events'
   *
   * @param { string | MockPushStream } stream
   * @param { MockPushEvent | Array<MockPushEvent> } events
   */
  addPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>
  ): void;

  /**
   * Load mock files from disk
   *
   * @param { string | Array<string> } filePaths
   */
  load(filePaths: string | Array<string>): void;

  /**
   * Match and handle mock response for 'req'
   * Will respond if 'res' passed
   *
   * @param { string | ClientRequest } req
   * @param { ServerResponse } [res]
   * @returns { boolean | object | undefined }
   */
  matchResponse(
    req: string | IncomingMessage,
    res: OutgoingMessage
  ): boolean | { [key: string]: any } | undefined;

  /**
   * Match and handle mock push event for 'stream'
   *
   * @param { string | MockPushStream } stream
   * @param { string } name
   * @param { (stream: string | PushStream, event: PushEvent) => void } push
   * @returns { boolean }
   */
  matchPushEvent(
    stream: string | MockPushStream,
    name: string,
    push: (stream: string | PushStream, event: PushEvent) => void
  ): boolean;

  /**
   * Determine if 'url' matches cached mock
   *
   * @param { URL } url
   * @returns { boolean }
   */
  hasMatch(url: URL): boolean;

  /**
   * Remove existing mock
   *
   * @param { string | IncomingMessage | MockPushStream } reqOrStream
   * @returns { void }
   */
  remove(reqOrStream: string | IncomingMessage | MockPushStream): void;

  /**
   * Clear all mocks
   *
   * @returns { void }
   */
  clean(): void;
}

export class TestServer {
  latency: number;
  mocks: Mock;
  webroot: string;

  constructor(options: TestServerOptions);

  /**
   * Load mock files at 'filePath'
   *
   * @param { string | Array<string> } filePath
   */
  loadMockFiles(filePath: string | Array<string>): void;

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
export function server(filePath: string, options?: ServerOptions): Server;

/**
 * Create test server
 *
 * @param { TestServerOptions } [options]
 * @returns { TestServer }
 */
export function testServer(options: TestServerOptions): Promise<TestServer>;

export namespace testServer {
  /**
   * Disable all external network connections
   * and optionally reroute all external requests to this server
   *
   * @param { boolean } [rerouteAllRequests]
   * @returns { void }
   */
  export function disableNetwork(rerouteAllRequests?: boolean): void;

  /**
   * Enable all external network connections
   *
   * @returns { void }
   */
  export function enableNetwork(): void;
}
