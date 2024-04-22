declare interface PushClient {
  on(event: string, callback: (event: { data: string }) => void): void;
  send(msg: Buffer | string, options?: PushEventOptions): void;
  removeAllListeners(): void;
  close(): void;
}

declare interface PushStream {
  url: string;
  type: string;
}

declare interface PushEvent {
  message: Buffer | string | Record<string, unknown>;
  options?: PushEventOptions;
}

declare interface PushEventOptions {
  id?: string; // EventSource ID
  event?: string; // EventSource event OR Socket.IO event
  namespace?: string; // Socket.IO namespace
  protocol?: string; // Socket.IO protocol
}
