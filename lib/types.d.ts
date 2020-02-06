declare module 'server-destroy' {
  function destroy(server: import('http').Server): void;
  export = destroy;
}

declare module 'faye-websocket' {
  class PushClient {
    on(event: string, callback: (event: { data: string }) => void): void;
    send(msg: string, options?: PushEventOptions): void;
    removeAllListeners(): void;
    close(): void;
  }
  class EventSource extends PushClient {
    static isEventSource(eventSource: unknown): boolean;
    constructor(req: Req, res: Res, options: object);
  }
  class WebSocket extends PushClient {
    static isWebSocket(webSocket: unknown): boolean;
    static EventSource: EventSource;
    constructor(
      req: Req,
      socket: object,
      body: string,
      protocols: Array<object>,
      options: { extensions: Array<unknown> }
    );
  }
  export = WebSocket;
}

declare module 'permessage-deflate' {
  function deflate(): void;
  export = deflate;
}

declare type Req = import('http').IncomingMessage & {
  filePath: string;
  type: string;
  url: string;
};

declare type Res = import('http').ServerResponse & {
  encoding: string;
  transpiled: boolean;
  url: string;
};

declare type RequestHandler = (req: Req, res: Res) => void;

declare type DestroyableHttpServer = import('http').Server & {
  destroy?(): void;
};

declare type Config = {
  activePort: number;
  bundleDir: string;
  bundleDirName: string;
  directories: Array<string>;
  extensionsByType: {
    [type: string]: Array<string>;
  };
  latency: number;
  maxAge: string;
  maxModuleBundlerWorkers: number;
  port: number;
  rollupConfigPath: string;
  testing: boolean;
  typesByExtension: {
    [extension: string]: string;
  };
};

declare type PatchResponseConfig = {
  directories?: Array<string>;
  rollupConfig?: {};
  footerScript?: {
    hash?: string;
    string: string;
    url?: string;
  };
  headerScript?: {
    hash?: string;
    string: string;
    url?: string;
  };
};

declare type Transpiler = (
  filePath: string,
  isServer: boolean
) => Promise<string> | string | undefined;

declare type TranspilerCache = Map<string, string>;

declare type TranspilerState = {
  transpilerCache: TranspilerCache;
  lastChanged: string;
  transpiler: Transpiler;
};

declare type Watcher = {
  add: (filePath: string) => void;
  close: () => void;
};

declare type BundleWorker = (
  id: string,
  outputPath: string,
  overrideOptions: import('rollup').RollupOptions | undefined,
  fn: (err?: Error) => void
) => void;

declare type Reloader = {
  client: string;
  url: string;
  destroy: () => Promise<void>;
  send: (filePath: string) => void;
};

declare type Package = {
  aliases: { [key: string]: string };
  isNodeModule: boolean;
  manifestPath: string;
  main?: string;
  name: string;
  path: string;
  paths: Array<string>;
  version: string;
};

declare type InterceptClientRequestCallback = (url: URL) => boolean;

declare type InterceptFileReadCallback = (filePath: string) => void;

declare type InterceptProcessOnCallback = (
  event: string,
  callback: () => void
) => void;

declare type MockResponseData = {
  key: string;
  filePath: string;
  url: URL;
  ignoreSearch: boolean;
  once: boolean;
  type: 'html' | 'file' | 'json';
  response: MockResponse;
};

declare type MockStreamData = {
  key: string;
  filePath: string;
  url: URL;
  ignoreSearch: boolean;
  type: 'ws' | 'es';
  protocol: string;
  events: {
    [name: string]: {
      name: string;
      message?: string | { [key: string]: any };
      sequence?: Array<{}>;
      options: MockPushEventOptions & {
        protocol?: string;
      };
    };
  };
};

declare type MockCacheEntry = {
  [key: string]: MockResponseData | MockStreamData;
};

declare class MockInstance {
  cache: Map<string, MockCacheEntry>;
  client: string;

  constructor(filePaths?: string | Array<string>);
  addResponse(
    req: string | MockRequest,
    res: MockResponse,
    once?: boolean
  ): void;
  addPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>
  ): void;
  load(filePaths: string | Array<string>): void;
  matchResponse(
    key: string,
    req?: Req,
    res?: Res
  ): false | MockResponseData | MockStreamData | undefined;
  matchPushEvent(
    stream: string | MockPushStream,
    name: string,
    push: (stream: string | PushStream, event: PushEvent) => void
  ): boolean;
  hasMatch(
    keyOrObjectWithUrl: string | URL | Req | MockRequest | MockPushStream
  ): boolean;
  remove(
    keyOrObjectWithUrl: string | URL | Req | MockRequest | MockPushStream
  ): void;
  clean(): void;
}

declare type MockResponseJSONSchema = {
  request: MockRequest;
  response: MockResponse;
};

declare type MockPushEventJSONSchema = {
  stream: MockPushStream;
  events: MockPushEvent;
};

/* export */ declare type MockRequest = {
  url: string;
  filePath?: string;
  ignoreSearch?: boolean;
};

/* export */ declare type MockResponse = {
  body: string | { [key: string]: any };
  hang?: boolean;
  headers?: { [key: string]: any };
  error?: boolean;
  missing?: boolean;
};

/* export */ declare type MockPushStream = {
  url: string;
  type: string;
  filePath?: string;
  ignoreSearch?: boolean;
  protocol?: string;
};

/* export */ declare type MockPushEventOptions = {
  delay?: number;
  event?: string;
  id?: string;
};

/* export */ declare type MockPushEvent = {
  name: string;
  connect?: boolean;
  message?: string | { [key: string]: any };
  sequence?: Array<MockPushEvent>;
  options?: MockPushEventOptions;
};

declare interface PushClient {
  on(event: string, callback: (event: { data: string }) => void): void;
  send(msg: string, options?: PushEventOptions): void;
  removeAllListeners(): void;
  close(): void;
}

/* export */ declare type PushStream = {
  url: string;
  type: string;
};

/* export */ declare type PushEventOptions = {
  event?: string;
  id?: string;
  namespace?: string;
  protocol?: string;
};

/* export */ declare type PushEvent = {
  message: string | { [key: string]: any };
  options?: PushEventOptions;
};

/* export */ declare type ServerOptions = {
  mockPath?: string | Array<string>;
  port?: number;
  reload?: boolean;
  silent?: boolean;
  transpiler?: string;
};

/* export */ declare type Server = {
  port: number;
  restart(): Promise<void>;
  destroy(): Promise<void>;
};

/* export */ declare type TestServerOptions = {
  autorespond?: boolean;
  latency?: number;
  port?: number;
  webroot?: string;
};

declare class TestServerInstance {
  latency: number;
  mocks: MockInstance;
  webroot: string;

  constructor(options: TestServerOptions);
  loadMockFiles(filePath: string | Array<string>): void;
  mockResponse(
    request: string | MockRequest,
    response: MockResponse,
    once?: boolean
  ): void;
  mockPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>
  ): void;
  pushEvent(stream: string | PushStream, event?: string | PushEvent): void;
  destroy(): Promise<void>;
}

/* export */ declare function testServer(
  options: TestServerOptions
): Promise<TestServerInstance>;

/* export */ declare namespace testServer {
  /* export */ function disableNetwork(rerouteAllRequests?: boolean): void;
  /* export */ function enableNetwork(): void;
}
