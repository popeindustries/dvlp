declare type ElectronHostMessage = {
  type: 'start';
  mocks: JSON<Array<DeserializedMock>>;
};

declare type ElectronProcessMessage = { type: 'started' };
