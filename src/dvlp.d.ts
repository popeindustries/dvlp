/// <reference types="node" />

/**
 * Retrieve all dependencies for "filePath"
 *
 * @param { string } filePath
 * @param { 'browser' | 'node' } platform
 */
export function getDependencies(
  filePath: string,
  platform: 'browser' | 'node',
): Promise<Array<string>>;

/**
 * Factory for creating `Server` instances
 */
export function server(
  filePath?: string | Array<string>,
  options?: ServerOptions,
): Promise<Server>;
