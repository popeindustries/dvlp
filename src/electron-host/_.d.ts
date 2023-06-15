declare interface ElectronProcess {
  readonly origin: string | undefined;
  readonly isListening: boolean;
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
  | { type: 'watch'; filePath: string };
