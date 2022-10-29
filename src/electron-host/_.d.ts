declare type ElectronHostMessage = {
  type: 'start';
  main: string;
  mocks?: Array<DeserializedMock>;
  origin: string;
};
