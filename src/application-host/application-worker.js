import { interceptInProcess } from 'dvlp/internal';
import { workerData } from 'node:worker_threads';

const messagePort = /** @type { import('worker_threads').MessagePort } */ (
  workerData.messagePort
);

interceptInProcess({
  origin: '',
  hostOrigin: workerData.hostOrigin,
  postMessage: /** @param { ApplicationWorkerMessage } msg */ (msg) =>
    messagePort.postMessage(msg),
  serializedMocks: workerData.serializedMocks,
});

messagePort.on(
  'message',
  /** @param { ApplicationHostMessage } msg */
  async (msg) => {
    if (msg.type === 'start') {
      try {
        await import(msg.main);
      } catch (err) {
        console.error(err);
        throw err;
      }
    }
  },
);
