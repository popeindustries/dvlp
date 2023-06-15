/// <reference types="node" />

/**
 * Factory for creating `Server` instances
 */
export function server(
  filePath?: string | Array<string>,
  options?: ServerOptions,
): Promise<Server>;
