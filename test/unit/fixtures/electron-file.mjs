import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

await app.whenReady();

ipcMain.on('done', () => {
  setTimeout(() => {
    process.send('test:done');
  }, 100);
});

const window = new BrowserWindow({
  show: false,
  webPreferences: {
    contextIsolation: false,
    sandbox: false,
    preload: path.resolve('./test/unit/fixtures/electron/preload.cjs'),
  },
});

await window.loadFile('./test/unit/fixtures/electron/index.html');
