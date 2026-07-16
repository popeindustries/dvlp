export interface PushClient {
  on(
    event: string,
    callback: (event?: {
      data?: string | Buffer;
      code?: number;
      reason?: string;
    }) => void,
  ): void;
  send(msg: Buffer | string, options?: PushEventOptions): void;
  ping?(message?: string, callback?: () => void): void;
  removeAllListeners(): void;
  close(code?: number, reason?: string): void;
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
