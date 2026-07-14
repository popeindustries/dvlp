import type { DefaultResolve, ResolveHookContext } from '../hooks/types.ts';
import type { ContentType } from '../types.ts';

export interface PatchResponseOptions {
  directories?: Array<string>;
  footerScript?: {
    string: string;
    url?: string;
  };
  headerScript?: {
    string: string;
    url?: string;
  };
  send?(filePath: string, responseBody: string): string | undefined;
  resolveImport?(
    specifier: string,
    context: ResolveHookContext,
    defaultResolve: DefaultResolve,
  ): string | false | undefined;
}

export interface FindOptions {
  directories?: Array<string>;
  type?: ContentType;
}

export interface Platform {
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

export type InterceptClientRequestCallback = (url: URL) => boolean;

export type InterceptFileAccessCallback = (
  filePath: string,
  mode: 'read' | 'write',
) => void;

export type InterceptCreateServerCallback = (origin: string) => void;

export interface Watcher {
  has(filePath: string): boolean;
  add(filePath: string | Array<string> | Set<string>): void;
  remove(filePath: string, permanent?: boolean): void;
  close(): void;
}

export interface RequestContext {
  assert: ImportAssertionType;
  dynamic: boolean;
  filePath?: string;
  href: string;
  imported: boolean;
  type?: ContentType;
}

export type ImportAssertionType = 'css' | 'json' | undefined;
