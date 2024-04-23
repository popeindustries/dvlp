declare interface ServerOptions {
  /**
   * The command-line arguments to pass to the application thread or electron process (default `[]`).
   */
  argv?: Array<string>;
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
   * Run file as electron.js entry file (default `false`).
   */
  electron?: boolean;
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
   * Disable/enable all logging (default `false`).
   */
  silent?: boolean;
  /**
   * Disable/enable verbose logging (default `false`).
   */
  verbose?: boolean;
}

declare interface Server {
  /**
   * The entry config
   */
  readonly entry: Entry;
  /**
   * The listening state
   */
  readonly isListening: boolean;
  /**
   * The localhost origin
   */
  readonly origin: string;
  /**
   * The `Mocks` instance
   */
  readonly mocks: Mocks;
  /**
   * The localhost port number
   */
  readonly port: number;
  /**
   * The active application worker thread, if initialised
   */
  readonly applicationWorker?: ApplicationWorker;
  /**
   * The active electron process, if initialised
   */
  readonly electronProcess?: ElectronProcess;
  /**
   * Add `filePaths` to file watcher
   */
  addWatchFiles(filePaths: string | Array<string>): void;
  /**
   * Destroy server instance
   */
  destroy(): Promise<void>;
}
