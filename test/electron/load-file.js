import { app, BrowserWindow } from 'electron';

await app.whenReady();

const win = new BrowserWindow({ width: 800, height: 600 });
win.loadFile('index.html');
