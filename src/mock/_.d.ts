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
  matchResponse(href: string, req?: Req, res?: Res): boolean | MockResponseData;
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

declare type MockResponseDataType = 'html' | 'file' | 'json';
declare type MockStreamDataType = 'ws' | 'es';

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

declare interface MockRequest {
  url: string;
  filePath?: string;
  ignoreSearch?: boolean;
}

declare type MockResponseHandler = (req: Req, res: Res) => void;

declare interface MockResponse {
  body: string | { [key: string]: any };
  hang?: boolean;
  headers?: { [key: string]: any };
  error?: boolean;
  missing?: boolean;
  offline?: boolean;
  status?: number;
}

declare interface MockResponseJSONSchema {
  request: MockRequest;
  response: MockResponse;
}

declare interface MockPushEventJSONSchema {
  stream: MockPushStream;
  events: Array<MockPushEvent>;
}

declare interface MockPushStream {
  url: string;
  type: string;
  filePath?: string;
  ignoreSearch?: boolean;
  protocol?: string;
}

declare interface MockPushEventOptions {
  delay?: number;
  connect?: boolean;
  event?: string;
  id?: string;
  namespace?: string;
}

declare interface MockPushEvent {
  name: string;
  message?: string | { [key: string]: any };
  sequence?: Array<MockPushEvent>;
  options?: MockPushEventOptions;
}

declare interface SerializedMock {
  href: string;
  originRegex: string;
  pathRegex: string;
  search: string;
  ignoreSearch: boolean;
  events?: Array<string>;
}

declare interface DeserializedMock {
  href: string;
  originRegex: RegExp;
  pathRegex: RegExp;
  search: URLSearchParams;
  ignoreSearch: boolean;
  events?: Array<string>;
}
