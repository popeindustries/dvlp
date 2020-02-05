declare type RequestHandler = (
  req: import('http').ClientRequest,
  res: import('http').ServerResponse
) => void;

declare type Config = {
  activePort: number;
  bundelDir: string;
  bundleDirName: string;
  directories: Array<string>;
  extensionsByType: {
    css: Array<string>;
    html: Array<string>;
    js: Array<string>;
  };
  latency: number;
  maxAge: string;
  maxModuleBundleWorkers: number;
  port: number;
  testing: boolean;
  typesByExtension: {
    [extension: string]: string;
  };
};

declare type PatchResponseConfig = {
  directories: Array<string>;
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
  add: (filePath: string, allowNodeModules: boolean) => void;
  close: () => void;
};

declare type BundleWorker = (
  id: string,
  outputPath: string,
  overrideOptions: import('rollup').RollupOptions,
  fn: (err: Error) => void
) => void;

declare class ReloadServer {
  clients: Set<EventSource>;
  port: number;
  server: import('http').Server;

  constructor(port: number);
  start(): Promise<void>;
  send(filePath: string): void;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

declare type Reloader = {
  client: string;
  clientHash: string;
  destroy: () => Promise<void>;
  send: (filePath: string) => void;
};

declare type Package = {
  aliases: { [key: string]: string };
  isNodeModule: boolean;
  manifestPath: string;
  main: string;
  name: string;
  path: string;
  paths: Array<string>;
  version: string;
};

export declare type MockRequest = {
  url: string;
  filePath?: string;
  ignoreSearch?: boolean;
};

export declare type MockResponse = {
  body: string | { [key: string]: any };
  hang?: boolean;
  headers?: { [key: string]: any };
  error?: boolean;
  missing?: boolean;
};

export declare type MockPushStream = {
  url: string;
  type: string;
  filePath?: string;
  ignoreSearch?: boolean;
  protocol?: string;
};

export declare type MockPushEvent = {
  name: string;
  message?: string | { [key: string]: any };
  sequence?: Array<MockPushEvent>;
  options?: {
    delay?: number;
    event?: string;
    id?: string;
  };
};

export declare type PushStream = {
  url: string;
  type: string;
};

export declare type PushEvent = {
  message: string | { [key: string]: any };
  options?: {
    event?: string;
    id?: string;
  };
};

export declare type ServerOptions = {
  mockPath?: string | Array<string>;
  port?: number;
  reload?: boolean;
  silent?: boolean;
  transpiler?: string;
};

export declare type Server = {
  port: number;
  restart(): Promise<void>;
  destroy(): Promise<void>;
};

export declare type TestServerOptions = {
  autorespond?: boolean;
  latency?: number;
  port?: number;
  webroot?: string;
};

export class TestServer {
  latency: number;
  mocks: Mock;
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

export function testServer(
  options: TestServerOptions
): Promise<TestServer>;

export namespace testServer {
  export declare function disableNetwork(
    rerouteAllRequests?: boolean
  ): void;
  export declare function enableNetwork(): void;
}
