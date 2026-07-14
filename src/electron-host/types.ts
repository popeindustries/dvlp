import type { ChildProcess } from 'node:child_process';
import type { SerializedMock } from '../mock/types.js';

export interface ElectronProcess {
  readonly activeThread?: ChildProcess;
  readonly origins: Set<string>;
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

export interface ElectronProcessWorkerData {
  hostOrigin: string;
  main: string;
  postMessage(msg: ElectronProcessMessage): void;
  serializedMocks?: Array<SerializedMock>;
}

export type ElectronProcessMessage =
  | { type: 'started' }
  | {
      type: 'listening';
      origin: string;
    }
  | { type: 'watch'; filePath: string; mode: 'read' | 'write' };
