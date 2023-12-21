/**
 * @typedef { import('worker_threads').MessagePort } MessagePort
 */

import { config, error, interceptInProcess } from 'dvlp/internal';
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
            messagePort.postMessage({ type: 'watch', filePath, mode: 'read' });
          }
        }
      }
    }
  },
);

process.on('uncaughtException', error);
process.on('unhandledRejection', error);

if ('register' in module) {
  /**
   * @type { { parentURL: string, data?: unknown, transferList?: Array<MessagePort> } }
   */
  const options = {
    parentURL: import.meta.url,
  };

  // Disable in CI to prevent process from hanging due to port transfer(?)
  if (!process.env.CI) {
    const { port1, port2 } = new MessageChannel();

    port1.unref();
    port1.on(
      'message',
      /** @param { ApplicationLoaderMessage } msg */
      (msg) => {
        if (msg.type === 'dependency') {
          const { filePath } = msg;

          messagePort.postMessage({ type: 'watch', filePath, mode: 'read' });
        }
      },
    );

    options.data = { port: port2 };
    options.transferList = [port2];
  }

  module.register(config.applicationLoaderURL.href, options);
}
