import { Hooks, Req, Res, Server, ServerOptions } from './_dvlp';

export { Hooks, Server, ServerOptions };

/**
 * Factory for creating `Server` instances
 */
export function server(filePath: string | Array<string> | (() => void), options?: ServerOptions): Promise<Server>;
