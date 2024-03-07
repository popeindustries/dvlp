import { interceptInProcess } from 'dvlp/internal';
import { workerData } from 'node:worker_threads';

const messagePort = /** @type { import('worker_threads').MessagePort } */ (
  workerData.dvlp.messagePort
);

interceptInProcess({
  hostOrigin: workerData.dvlp.hostOrigin,
  postMessage: /** @param { ApplicationWorkerMessage } msg */ (msg) =>
    messagePort.postMessage(msg),
  serializedMocks: workerData.dvlp.serializedMocks,
});

await import(workerData.dvlp.main);
