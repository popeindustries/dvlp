/// <reference types="node" />

/**
 * Factory for creating `Server` instances
 */
export function server(filePath: string | Array<string> | (() => void), options?: ServerOptions): Promise<Server>;
