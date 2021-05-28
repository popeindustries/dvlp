declare interface ServerOptions {
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

declare interface Server {
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
