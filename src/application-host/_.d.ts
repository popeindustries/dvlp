declare interface ApplicationWorker {
  readonly origin: string;
  readonly isListening: boolean;
  sendMessage(message: string | object | number | boolean | bigint): void;
}

declare type ApplicationHostMessage = { type: 'start'; main: string };

declare type ApplicationWorkerMessage =
  | { type: 'started'; port: number }
  | { type: 'watch'; paths: Array<string> };

declare interface ApplicationWorkerPendingHandle {
  promise: Promise<{ body: string; href: string }>;
  resolve: (value: { body: string; href: string }) => void;
  reject: (value?: unknown) => void;
}
