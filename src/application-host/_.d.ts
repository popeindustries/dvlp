declare interface ApplicationWorker {
  readonly origin: string;
  readonly isListening: boolean;
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
declare type ApplicationWorkerMessage = { type: 'listening'; origin: string };

declare interface ApplicationWorkerPendingHandle {
  promise: Promise<{ body: string; href: string }>;
  resolve: (value: { body: string; href: string }) => void;
  reject: (value?: unknown) => void;
}
