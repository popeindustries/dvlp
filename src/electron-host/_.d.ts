declare interface ElectronProcess {
  readonly activeThread?: import('node:child_process').ChildProcess;
  readonly origin: string | undefined;
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

declare interface ElectronProcessWorkerData {
  origin: string;
  hostOrigin: string;
  main: string;
  postMessage(msg: ElectronProcessMessage): void;
  serializedMocks?: Array<SerializedMock>;
}

declare type ElectronProcessMessage =
  | {
      type: 'listening';
      origin: string;
    }
  | { type: 'started' }
  | { type: 'watch'; filePath: string; mode: 'read' | 'write' };
