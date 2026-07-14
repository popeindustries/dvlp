import type { Worker } from 'node:worker_threads';
import type { SerializedMock } from '../mock/types.js';

export interface ApplicationWorker {
  readonly activeProcess?: Worker;
  readonly origins: Set<string>;
  readonly isListening: boolean;
  /**
   * Add `filePaths` to file watcher
   */
  addWatchFiles(filePaths: string | Array<string>): void;
  /**
   * Send message to the application thread
   */
  sendMessage(message: string | object | number | boolean | bigint): void;
}

export interface ApplicationProcessWorkerData {
  hostOrigin: string;
  postMessage(msg: ApplicationWorkerMessage): void;
  main?: string;
  serializedMocks?: Array<SerializedMock>;
}

export type ApplicationHostMessage = { type: 'start'; main: string };

export type ApplicationLoaderMessage = {
  type: 'dependency';
  filePath: string;
};

export type ApplicationWorkerMessage =
  | { type: 'error'; error: string }
  | { type: 'listening'; origin: string }
  | { type: 'started' }
  | { type: 'watch'; filePath: string; mode: 'read' | 'write' };

export interface ApplicationWorkerPendingHandle {
  promise: Promise<{ body: string; href: string }>;
  resolve: (value: { body: string; href: string }) => void;
  reject: (value?: unknown) => void;
}
