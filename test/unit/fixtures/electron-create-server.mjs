import { app, BrowserWindow, ipcMain } from 'electron';
import { createServer } from 'http';
import fs from 'node:fs';
import path from 'node:path';

await app.whenReady();

ipcMain.on('done', () => {
  setTimeout(() => {
    process.send('test:done');
  }, 100);
});

createServer((req, res) => {
  res.writeHead(200);
  res.end(
    fs.readFileSync(
      path.resolve('./test/unit/fixtures/electron/index.html'),
      'utf8',
    ),
  );
}).listen('localhost:8100');

const window = new BrowserWindow({
  show: false,
  webPreferences: {
    contextIsolation: false,
    sandbox: false,
    preload: path.resolve('./test/unit/fixtures/electron/preload.cjs'),
  },
});

await window.loadURL('http://localhost:8100');
