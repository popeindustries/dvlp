import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { MessageChannel, Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await app.whenReady();

const { port1, port2 } = new MessageChannel();

await new Promise((resolve, reject) => {
  new Worker(join(__dirname, 'worker.js'), {
    transferList: [port2],
    workerData: {
      messagePort: port2,
    },
  });

  port1.on('message', (msg) => {
    if (msg === 'listening') {
      resolve();
    }
  });
});

new BrowserWindow({ width: 800, height: 600 }).loadURL('http://localhost:8100');
