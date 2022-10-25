declare type ApplicationHostMessage = { type: 'start'; main: string };

declare type ApplicationWorkerMessage =
  | { type: 'started' }
  | { type: 'watch'; paths: Array<string> };

declare interface ApplicationWorkerPendingHandle {
  promise: Promise<{ body: string; href: string }>;
  resolve: (value: { body: string; href: string }) => void;
  reject: (value?: unknown) => void;
}
