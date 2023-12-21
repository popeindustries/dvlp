declare interface ApplicationWorker {
  readonly activeProcess?: import('node:worker_threads').Worker;
  readonly origin: string;
  readonly isListening: boolean;
  /**
   * Add `filePaths` to file watcher
   */
  addWatchFiles(filePaths: string | Array<string>): void;
  /**
   * Send message to the electron process
   */
  sendMessage(message: string | object | number | boolean | bigint): void;
}

declare interface ApplicationProcessWorkerData {
  origin: string;
  hostOrigin: string;
  postMessage(msg: ApplicationWorkerMessage): void;
  main?: string;
  serializedMocks?: Array<SerializedMock>;
}

declare type ApplicationHostMessage = { type: 'start'; main: string };
declare type ApplicationLoaderMessage = {
  type: 'dependency';
  filePath: string;
};
declare type ApplicationWorkerMessage =
  | { type: 'error'; error: string }
  | { type: 'listening'; origin: string }
  | { type: 'watch'; filePath: string; mode: 'read' | 'write' };

declare interface ApplicationWorkerPendingHandle {
  promise: Promise<{ body: string; href: string }>;
  resolve: (value: { body: string; href: string }) => void;
  reject: (value?: unknown) => void;
}
