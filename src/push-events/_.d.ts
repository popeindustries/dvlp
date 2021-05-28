declare interface PushClient {
  on(event: string, callback: (event: { data: string }) => void): void;
  send(msg: string, options?: PushEventOptions): void;
  removeAllListeners(): void;
  close(): void;
}

declare interface PushStream {
  url: string;
  type: string;
}

declare interface PushEventOptions {
  event?: string;
  id?: string;
  namespace?: string;
  protocol?: string;
}

declare interface PushEvent {
  message: string | { [key: string]: any };
  options?: PushEventOptions;
}
