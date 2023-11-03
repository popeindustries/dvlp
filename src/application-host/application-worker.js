/**
 * @typedef { import('worker_threads').MessagePort } MessagePort
 */

import { config, interceptInProcess } from 'dvlp/internal';
import { MessageChannel } from 'node:worker_threads';
import module from 'node:module';
import { workerData } from 'node:worker_threads';

const messagePort = /** @type { MessagePort } */ (workerData.messagePort);

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
        messagePort.postMessage({ type: 'error', error: err });
      } finally {
        // TODO: deprecate with Node18
        if ('sources' in global) {
          for (const filePath of /** @type { Set<string> } */ (
            global.sources
          )) {
            messagePort.postMessage({ type: 'watch', filePath });
          }
        }
      }
    }
  },
);

if ('register' in module) {
  const { port1, port2 } = new MessageChannel();

  port1.unref();
  port1.on(
    'message',
    /** @param { ApplicationLoaderMessage } msg */
    (msg) => {
      if (msg.type === 'dependency') {
        const { filePath } = msg;

        messagePort.postMessage({ type: 'watch', filePath });
      }
    },
  );

  // @ts-ignore
  module.register(config.applicationLoaderURL.href, {
    parentURL: import.meta.url,
    data: {
      port: port2,
    },
    transferList: [port2],
  });
}
