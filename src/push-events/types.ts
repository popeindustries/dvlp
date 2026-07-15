export interface PushClient {
  on(event: string, callback: (event: { data: string }) => void): void;
  send(msg: Buffer | string, options?: PushEventOptions): void;
  removeAllListeners(): void;
  close(): void;
}

export interface PushStream {
  url: string;
  type: string;
}

export interface PushEvent {
  message:
    Buffer | ArrayBuffer | ArrayBufferView | string | Record<string, unknown>;
  options?: PushEventOptions;
}

export interface PushEventOptions {
  id?: string; // EventSource ID
  event?: string; // EventSource event OR Socket.IO event
  namespace?: string; // Socket.IO namespace
  protocol?: string; // Socket.IO protocol
}
