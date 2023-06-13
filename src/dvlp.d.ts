/// <reference types="node" />

/**
 * Factory for creating `Server` instances
 */
export function server(
  filePath?: string | Array<string>,
  options?: ServerOptions,
): Promise<Server>;

/**
 * Utilities for internal use between generated entry files
 */
export const __dvlp__: {
  interceptClientRequest(fn: (url: URL) => boolean): () => void;
  isEqualSearchParams(
    params1: URLSearchParams,
    params2: URLSearchParams,
  ): boolean;
};
