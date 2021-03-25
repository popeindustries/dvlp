declare namespace NodeJS {
  interface Global {
    $MOCK_CLIENT?: string;
    $RELOAD_CLIENT?: string;
    $VERSION: string;
  }
}

declare type IncomingMessage = import('http').IncomingMessage;
declare type ServerResponse = import('http').ServerResponse;
declare type HttpServer = import('http').Server;
declare type HttpsServer = import('https').Server;
declare type URL = import('url').URL;
declare type URLSearchParams = import('url').URLSearchParams;
declare type esbuild = {
  build(
    options: import('esbuild').BuildOptions & { write: false },
  ): Promise<import('esbuild').BuildResult & { outputFiles: import('esbuild').OutputFile[] }>;
  transform(input: string, options?: import('esbuild').TransformOptions): Promise<import('esbuild').TransformResult>;
};

declare interface Req extends IncomingMessage {
  filePath: string;
  type: string;
  url: string;
  params?: { [key: string]: string } | {};
}
declare interface Res extends ServerResponse {
  bundled: boolean;
  encoding: string;
  metrics: Metrics;
  mocked: boolean;
  transformed: boolean;
  unhandled: boolean;
  url: string;
  error?: Error;
}
declare type RequestHandler = (req: Req, res: Res) => void;
declare interface DestroyableHttpServer extends HttpServer {
  destroy?(): void;
}
declare interface DestroyableHttpsServer extends HttpsServer {
  destroy?(): void;
}

declare class Metrics {
  events: Map<string, [number, number]>;
  constructor(res: Res);
  recordEvent(name: string): void;
  getEvent(name: string, formatted?: boolean): string | number;
}
declare namespace Metrics {
  export enum EVENT_NAMES {
    bundle = 'bundle file',
    csp = 'inject CSP header',
    imports = 'rewrite imports',
    mock = 'mock response',
    response = 'response',
    scripts = 'inject HTML scripts',
    transpile = 'transpile file',
  }
}
declare interface Config {
  applicationDir: string;
  applicationDirName: string;
  applicationPort: number;
  brokenNamedExportsPackages: Record<string, Array<string>>;
  bundleDir: string;
  bundleDirName: string;
  directories: Array<string>;
  extensionsByType: {
    [type: string]: Array<string>;
  };
  format: 'cjs' | 'esm';
  latency: number;
  maxAge: string;
  port: number;
  reloadEndpoint: string;
  testing: boolean;
  typesByExtension: {
    [extension: string]: 'css' | 'html' | 'js';
  };
  version: string;
}

declare interface Entry {
  directories: Array<string>;
  isApp: boolean;
  isFunction: boolean;
  isStatic: boolean;
  main: string | (() => void) | undefined;
}

declare interface PatchResponseOptions {
  directories?: Array<string>;
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
  send?: (filePath: string, responseBody: string) => string | undefined;
  resolveImport?: (
    specifier: string,
    context: ResolveHookContext,
    defaultResolve: DefaultResolve,
  ) => string | false | undefined;
}

declare interface FindOptions {
  directories?: Array<string>;
  type?: string;
}

declare interface Watcher {
  add: (filePath: string) => void;
  close: () => void;
}

declare interface Reloader {
  destroy: () => Promise<void>;
  reloadEmbed: string;
  reloadPort: number;
  reloadUrl: string;
  send: (filePath: string) => void;
}

declare interface SecureProxy extends Reloader {
  commonName?: string;
}

declare interface Package {
  aliases: { [key: string]: string };
  isNodeModule: boolean;
  manifestPath: string;
  main?: string;
  name: string;
  path: string;
  paths: Array<string>;
  version: string;
}

declare interface Platform {
  manufacturer?: string;
  name?: string;
  os?: {
    architecture?: number;
    family?: string;
    version?: string;
  };
  ua: string;
  version?: string;
}

declare type InterceptClientRequestCallback = (url: URL) => boolean;

declare type InterceptFileReadCallback = (filePath: string) => void;

declare type InterceptProcessOnCallback = (event: string, callback: () => void) => void;

declare type MockResponseDataType = 'html' | 'file' | 'json';

declare interface MockResponseData {
  url: URL;
  originRegex: RegExp;
  pathRegex: RegExp;
  paramsMatch: import('path-to-regexp').MatchFunction;
  searchParams: URLSearchParams;
  ignoreSearch: boolean;
  once: boolean;
  filePath: string;
  type: MockResponseDataType;
  response: MockResponse | MockResponseHandler;
  callback?: () => void;
}

declare type MockStreamDataType = 'ws' | 'es';

declare interface MockStreamEventData {
  name?: string;
  message: string | { [key: string]: any };
  options: MockPushEventOptions & {
    protocol?: string;
  };
}

declare interface MockStreamData {
  url: URL;
  originRegex: RegExp;
  pathRegex: RegExp;
  paramsMatch: import('path-to-regexp').MatchFunction;
  searchParams: URLSearchParams;
  ignoreSearch: boolean;
  filePath: string;
  type: MockStreamDataType;
  protocol: string;
  events: { [name: string]: Array<MockStreamEventData> };
}

declare class Mock {
  cache: Set<MockResponseData | MockStreamData>;
  client: string;
  constructor(filePaths?: string | Array<string>);
  addResponse(
    req: string | MockRequest,
    res: MockResponse | MockResponseHandler,
    once?: boolean,
    onMock?: () => void,
  ): () => void;
  addPushEvents(stream: string | MockPushStream, events: MockPushEvent | Array<MockPushEvent>): () => void;
  load(filePaths: string | Array<string>): void;
  matchResponse(href: string, req?: Req, res?: Res): boolean | MockResponseData | undefined | void;
  matchPushEvent(
    stream: string | MockPushStream,
    name: string,
    push: (stream: string | PushStream, event: PushEvent) => void,
  ): boolean;
  hasMatch(reqOrMockData: string | URL | { url: string } | MockResponseData | MockStreamData): boolean;
  remove(reqOrMockData: string | URL | { url: string } | MockResponseData | MockStreamData): void;
  clear(): void;
  /** @deprecated */
  clean(): void;
}

declare interface MockResponseJSONSchema {
  request: MockRequest;
  response: MockResponse;
}

declare class TestServer {
  latency: number;
  port: number;
  mocks: Mock;
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
  mockPushEvents(stream: string | MockPushStream, events: MockPushEvent | Array<MockPushEvent>): void;
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

declare interface DependencyBundleHookContext {
  esbuild: esbuild;
}

declare interface TransformHookContext {
  client: {
    manufacturer?: string;
    name?: string;
    ua: string;
    version?: string;
  };
  esbuild: esbuild;
}

declare interface ResolveHookContext {
  importer: string;
  isDynamic: boolean;
}

declare type DefaultResolve = (specifier: string, importer: string) => string | undefined;

/* export */ declare interface Hooks {
  onDependencyBundle?(
    id: string,
    filePath: string,
    fileContents: string,
    context: DependencyBundleHookContext,
  ): Promise<string> | string | undefined;
  onTransform?(
    filePath: string,
    fileContents: string,
    context: TransformHookContext,
  ): Promise<string> | string | undefined;
  onResolveImport?(
    specifier: string,
    context: ResolveHookContext,
    defaultResolve: DefaultResolve,
  ): string | false | undefined;
  onSend?(filePath: string, responseBody: string): string | undefined;
  onServerTransform?(filePath: string, fileContents: string): string | undefined;
}

/* export */ declare interface MockRequest {
  url: string;
  filePath?: string;
  ignoreSearch?: boolean;
}

/* export */ declare type MockResponseHandler = (req: Req, res: Res) => void;

/* export */ declare interface MockResponse {
  body: string | { [key: string]: any };
  hang?: boolean;
  headers?: { [key: string]: any };
  error?: boolean;
  missing?: boolean;
  offline?: boolean;
  status?: number;
}

declare interface MockPushEventJSONSchema {
  stream: MockPushStream;
  events: Array<MockPushEvent>;
}

/* export */ declare interface MockPushStream {
  url: string;
  type: string;
  filePath?: string;
  ignoreSearch?: boolean;
  protocol?: string;
}

/* export */ declare interface MockPushEventOptions {
  delay?: number;
  connect?: boolean;
  event?: string;
  id?: string;
  namespace?: string;
}

/* export */ declare interface MockPushEvent {
  name: string;
  message?: string | { [key: string]: any };
  sequence?: Array<MockPushEvent>;
  options?: MockPushEventOptions;
}

declare interface PushClient {
  on(event: string, callback: (event: { data: string }) => void): void;
  send(msg: string, options?: PushEventOptions): void;
  removeAllListeners(): void;
  close(): void;
}

/* export */ declare interface PushStream {
  url: string;
  type: string;
}

/* export */ declare interface PushEventOptions {
  event?: string;
  id?: string;
  namespace?: string;
  protocol?: string;
}

/* export */ declare interface PushEvent {
  message: string | { [key: string]: any };
  options?: PushEventOptions;
}

/* export */ declare interface ServerOptions {
  /**
   * The path or glob pattern containing ".crt" and ".key" files.
   * This enables secure https mode by proxying all requests through a secure server (default `''`).
   */
  certsPath?: string | Array<string>;
  /**
   * Additional directories to use for resolving file requests (default `[]`).
   */
  directories?: Array<string>;
  /**
   * The path to a custom hooks registration file (default `''`).
   */
  hooksPath?: string;
  /**
   * The path(s) to load mock files from.
   */
  mockPath?: string | Array<string>;
  /**
   * Port to expose on `localhost`.
   * Will use `process.env.PORT` if not specified here (default `8080`).
   */
  port?: number;
  /**
   * Enable/disable browser reloading (default `true`).
   */
  reload?: boolean;
  /**
   * Disable/enable default logging (default `false`).
   */
  silent?: boolean;
}

/* export */ declare interface Server {
  port: number;
  /**
   * Restart running server
   */
  restart(): Promise<void>;
  /**
   * Destroy server instance
   */
  destroy(): Promise<void>;
}

/* export */ declare function server(
  filePath: string | Array<string> | (() => void),
  options?: ServerOptions,
): Promise<Server>;

/* export */ declare interface TestServerOptions {
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

/* export */ declare function testServer(options: TestServerOptions): Promise<TestServer>;

/* export */ declare namespace testServer {
  /**
   * Disable all external network connections,
   * and optionally reroute all external requests to this server with `rerouteAllRequests=true`
   */
  /* export */ function disableNetwork(rerouteAllRequests?: boolean): void;
  /**
   * Re-enable all external network connections
   */
  /* export */ function enableNetwork(): void;
  /**
   * Default mock response handler for network hang
   */
  /* export */ function mockHangResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for 500 response
   */
  /* export */ function mockErrorResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for 404 response
   */
  /* export */ function mockMissingResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for offline
   */
  /* export */ function mockOfflineResponseHandler(url: URL, req: Req, res: Res): undefined;
}

/* export  */ declare namespace testBrowser {
  /**
   * Disable all external network connections,
   * and optionally reroute all external requests to this server with `rerouteAllRequests=true`
   */
  /* export  */ function disableNetwork(rerouteAllRequests?: boolean): void;
  /**
   * Re-enable all external network connections
   */
  /* export  */ function enableNetwork(): void;
  /**
   * Add mock response for "req"
   */
  /* export  */ function mockResponse(
    req: string | MockRequest,
    res?: MockResponse | MockResponseHandler,
    once?: boolean,
    onMockCallback?: () => void,
  ): () => void;
  /**
   * Push data to WebSocket/EventSource clients
   * A string passed as `event` will be handled as a named mock push event
   */
  /* export  */ function pushEvent(stream: string, event?: string | PushEvent): void;
}

interface Window {
  dvlp: typeof testBrowser;
}
