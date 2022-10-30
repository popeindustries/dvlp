declare interface ElectronProcess {
  readonly isListening: boolean;
  sendMessage(message: string | object | number | boolean | bigint): void;
}

declare type ElectronHostMessage = {
  type: 'start';
  main: string;
  mocks?: Array<DeserializedMock>;
  origin: string;
};

declare type ElectronProcessMessage = {
  type: 'started';
};
