import type { IncomingHttpHeaders, ServerResponse } from 'node:http';
import type { MatchFunction, ParamData } from 'path-to-regexp';
import type { PushEvent, PushStream } from '../push-events/types.ts';
import type { Req, Res } from '../types.ts';

export interface Mocks {
  addResponse(
    req: string | MockRequest,
    res: MockResponse | MockResponseHandler,
    once?: boolean,
    onMock?: () => void,
  ): MockedResponse;
  addPushEvents(
    stream: string | MockPushStream,
    events: MockPushEvent | Array<MockPushEvent>,
  ): () => void;
  load(filePaths: string | Array<string>): void;
  matchResponse(href: string, req?: Req, res?: Res): boolean | MockResponseData;
  matchPushEvent(
    stream: string | MockPushStream,
    name: string,
    push: (stream: string | PushStream, event: PushEvent) => void,
  ): boolean;
  hasMatch(
    reqOrMockData:
      string | URL | { url: string } | MockResponseData | MockStreamData,
  ): boolean;
  remove(
    reqOrMockData:
      string | URL | { url: string } | MockResponseData | MockStreamData,
  ): void;
  clear(): void;
  /** @deprecated */
  clean(): void;
}

export type MockResponseDataType = 'html' | 'file' | 'json';
export type MockStreamDataType = 'ws' | 'es';

export interface MockResponseData {
  url: URL;
  originRegex: RegExp;
  pathRegex: RegExp;
  paramsMatch: MatchFunction<ParamData>;
  searchParams: URLSearchParams;
  ignoreSearch: boolean;
  method?: string;
  once: boolean;
  filePath: string;
  type: MockResponseDataType;
  response: MockResponse | MockResponseHandler;
  callback?: () => void;
  calls: Array<MockRequestCall>;
}

export interface MockStreamEventData {
  name?: string;
  message:
    Buffer | ArrayBuffer | ArrayBufferView | string | Record<string, any>;
  options: MockPushEventOptions & {
    protocol?: string;
  };
}

export interface MockStreamData {
  url: URL;
  originRegex: RegExp;
  pathRegex: RegExp;
  paramsMatch: MatchFunction<ParamData>;
  searchParams: URLSearchParams;
  ignoreSearch: boolean;
  filePath: string;
  type: MockStreamDataType;
  protocol: string;
  events: { [name: string]: Array<MockStreamEventData> };
}

export interface MockRequest {
  url: string;
  filePath?: string;
  ignoreSearch?: boolean;
  /**
   * Match a specific HTTP method (any method matches when omitted).
   * A method-specific mock is preferred over a method-less one for the same url.
   */
  method?: string;
}

/**
 * Handlers receive the plain http response type so header/writeHead overloads
 * resolve cleanly. Under https/http2 the compat response supports the same api.
 */
export type MockHandlerResponse = ServerResponse & {
  error?: Error;
};

export type MockResponseHandler = (req: Req, res: MockHandlerResponse) => void;

export interface MockResponse {
  body: string | Record<string, any>;
  /**
   * Delay responding by `delay` ms (ignored for handler responses)
   */
  delay?: number;
  hang?: boolean;
  headers?: Record<string, any>;
  error?: boolean;
  missing?: boolean;
  offline?: boolean;
  status?: number;
}

/**
 * A request that matched a registered mock
 */
export interface MockRequestCall {
  /**
   * Raw request body ("undefined" when the request had none)
   */
  body: string | undefined;
  headers: IncomingHttpHeaders;
  method: string | undefined;
  params?: Record<string, string>;
  url: string;
}

/**
 * Handle returned when registering a mock response.
 * Call it to remove the mock; inspect "calls" to assert matched requests.
 */
export interface MockedResponse {
  (): void;
  /**
   * Requests that matched this mock, in call order
   */
  calls: Array<MockRequestCall>;
}

export interface MockResponseJSONSchema {
  request: MockRequest;
  response: MockResponse;
}

export interface MockPushEventJSONSchema {
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
  message?:
    Buffer | ArrayBuffer | ArrayBufferView | string | Record<string, any>;
  sequence?: Array<MockPushEvent>;
  options?: MockPushEventOptions;
}

export interface SerializedMock {
  href: string;
  originRegex: string;
  pathRegex: string;
  search: string;
  ignoreSearch: boolean;
  events?: Array<string>;
}

export interface DeserializedMock {
  href: string;
  originRegex: RegExp;
  pathRegex: RegExp;
  search: URLSearchParams;
  ignoreSearch: boolean;
  events?: Array<string>;
}
