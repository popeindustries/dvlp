type Http2ServerRequest = import('http2').Http2ServerRequest;
type Http2ServerResponse = import('http2').Http2ServerResponse;
type IncomingMessage = import('http').IncomingMessage;
type ServerResponse = import('http').ServerResponse;
type HttpServer = import('http').Server;
type HttpsServer = import('https').Server;
type URL = import('url').URL;
type URLSearchParams = import('url').URLSearchParams;
type esbuild = {
  build(
    options: import('esbuild').BuildOptions & { write: false },
  ): Promise<import('esbuild').BuildResult & { outputFiles: import('esbuild').OutputFile[] }>;
  transform(input: string, options?: import('esbuild').TransformOptions): Promise<import('esbuild').TransformResult>;
};

type Req = (IncomingMessage | Http2ServerRequest) & {
  filePath: string;
  type: string;
  url: string;
  params?: { [key: string]: string } | {};
};
type Res = (ServerResponse | Http2ServerResponse) & {
  bundled: boolean;
  encoding: string;
  metrics: Metrics;
  mocked: boolean;
  transformed: boolean;
  unhandled: boolean;
  url: string;
  error?: Error;
};
type RequestHandler = (req: Req, res: Res) => void;
interface DestroyableHttpServer extends HttpServer {
  destroy?(): void;
}
interface DestroyableHttpsServer extends HttpsServer {
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
  applicationFormat: 'cjs' | 'esm';
  applicationPort: number;
  brokenNamedExportsPackages: Record<string, Array<string>>;
  bundleDir: string;
  bundleDirName: string;
  directories: Array<string>;
  dvlpDir: string;
  esbuildTargetByExtension: {
    [extension: string]: string;
  };
  extensionsByType: {
    [type: string]: Array<string>;
  };
  latency: number;
  maxAge: string;
  port: number;
  reloadEndpoint: string;
  sourceMapsDir: string;
  testing: boolean;
  typesByExtension: {
    [extension: string]: 'css' | 'html' | 'js';
  };
  version: string;
}

interface Entry {
  directories: Array<string>;
  isApp: boolean;
  isFunction: boolean;
  isStatic: boolean;
  main: string | (() => void) | undefined;
}

interface PatchResponseOptions {
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

interface FindOptions {
  directories?: Array<string>;
  type?: string;
}

interface Watcher {
  add: (filePath: string) => void;
  close: () => void;
}

interface Reloader {
  destroy: () => Promise<void>;
  reloadEmbed: string;
  reloadPort: number;
  reloadUrl: string;
  send: (filePath: string) => void;
}

interface SecureProxy extends Reloader {
  commonName?: string;
  setApplicationPort(port: number): void;
}

interface Package {
  aliases: { [key: string]: string };
  exports?: string | { [key: string]: string | { [key: string]: string } };
  isProjectPackage: boolean;
  manifestPath: string;
  main?: string;
  name: string;
  path: string;
  paths: Array<string>;
  version: string;
}

interface Platform {
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

type InterceptClientRequestCallback = (url: URL) => boolean;
type InterceptFileReadCallback = (filePath: string) => void;
type InterceptProcessOnCallback = (event: string, callback: () => void) => void;
type MockResponseDataType = 'html' | 'file' | 'json';

interface MockResponseData {
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

type MockStreamDataType = 'ws' | 'es';

interface MockStreamEventData {
  name?: string;
  message: string | { [key: string]: any };
  options: MockPushEventOptions & {
    protocol?: string;
  };
}

interface MockStreamData {
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

interface MockResponseJSONSchema {
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

interface DependencyBundleHookContext {
  esbuild: Pick<esbuild, 'build'>;
}

interface TransformHookContext {
  client: {
    manufacturer?: string;
    name?: string;
    ua: string;
    version?: string;
  };
  esbuild: esbuild;
}

interface ResolveHookContext {
  importer: string;
  isDynamic: boolean;
}

type DefaultResolve = (specifier: string, importer: string) => string | undefined;

export interface Hooks {
  /**
   * Bundle non-esm node_modules dependency requested by the browser.
   * This hook is run after file read.
   */
  onDependencyBundle?(
    id: string,
    filePath: string,
    fileContents: string,
    context: DependencyBundleHookContext,
  ): Promise<string> | string | undefined;
  /**
   * Transform file contents for file requested by the browser.
   * This hook is run after file read, and before any modifications by dvlp.
   */
  onTransform?(
    filePath: string,
    fileContents: string,
    context: TransformHookContext,
  ): Promise<string> | string | undefined;
  /**
   * Manually resolve import specifier.
   * This hook is run for each import statement.
   * If returns "false", import re-writing is skipped.
   * If returns "undefined", import specifier is re-written using default resolver.
   * If "context.isDynamic", also possible to return replacement for whole expression.
   */
  onResolveImport?(
    specifier: string,
    context: ResolveHookContext,
    defaultResolve: DefaultResolve,
  ): string | false | undefined;
  /**
   * Manually handle response for incoming server request.
   * If returns "true", further processing by dvlp will be aborted.
   */
  onRequest?(
    request: IncomingMessage | Http2ServerRequest,
    response: ServerResponse | Http2ServerResponse,
  ): Promise<boolean> | boolean | undefined;
  /**
   * Modify response body before sending to the browser.
   * This hook is run after all modifications by dvlp, and before sending to the browser.
   */
  onSend?(filePath: string, responseBody: string): string | undefined;
  /**
   * Transform file contents for file imported by Node.js application server.
   * This hook is run after file read.
   */
  onServerTransform?(filePath: string, fileContents: string): string | undefined;
}

export interface MockRequest {
  url: string;
  filePath?: string;
  ignoreSearch?: boolean;
}

export type MockResponseHandler = (req: Req, res: Res) => void;

export interface MockResponse {
  body: string | { [key: string]: any };
  hang?: boolean;
  headers?: { [key: string]: any };
  error?: boolean;
  missing?: boolean;
  offline?: boolean;
  status?: number;
}

interface MockPushEventJSONSchema {
  stream: MockPushStream;
  events: Array<MockPushEvent>;
}

export interface MockPushStream {
  url: string;
  type: string;
  filePath?: string;
  ignoreSearch?: boolean;
  protocol?: string;
}

export interface MockPushEventOptions {
  delay?: number;
  connect?: boolean;
  event?: string;
  id?: string;
  namespace?: string;
}

export interface MockPushEvent {
  name: string;
  message?: string | { [key: string]: any };
  sequence?: Array<MockPushEvent>;
  options?: MockPushEventOptions;
}

interface PushClient {
  on(event: string, callback: (event: { data: string }) => void): void;
  send(msg: string, options?: PushEventOptions): void;
  removeAllListeners(): void;
  close(): void;
}

export interface PushStream {
  url: string;
  type: string;
}

export interface PushEventOptions {
  event?: string;
  id?: string;
  namespace?: string;
  protocol?: string;
}

export interface PushEvent {
  message: string | { [key: string]: any };
  options?: PushEventOptions;
}

export interface ServerOptions {
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

export interface Server {
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

export function server(filePath: string | Array<string> | (() => void), options?: ServerOptions): Promise<Server>;

export interface TestServerOptions {
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

export function testServer(options: TestServerOptions): Promise<TestServer>;

export namespace testServer {
  /**
   * Disable all external network connections,
   * and optionally reroute all external requests to this server with `rerouteAllRequests=true`
   */
  function disableNetwork(rerouteAllRequests?: boolean): void;
  /**
   * Re-enable all external network connections
   */
  function enableNetwork(): void;
  /**
   * Default mock response handler for network hang
   */
  function mockHangResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for 500 response
   */
  function mockErrorResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for 404 response
   */
  function mockMissingResponseHandler(url: URL, req: Req, res: Res): undefined;
  /**
   * Default mock response handler for offline
   */
  function mockOfflineResponseHandler(url: URL, req: Req, res: Res): undefined;
}

export as namespace _dvlp;
