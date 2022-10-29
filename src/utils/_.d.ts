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
declare type InterceptProcessOnCallback = (
  event: string,
  callback: () => void,
) => void;

declare interface Watcher {
  add: (filePath: string | Array<string> | Set<string>) => void;
  close: () => void;
}
