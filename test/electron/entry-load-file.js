import { app, BrowserWindow } from 'electron';

await app.whenReady();

new BrowserWindow({ width: 800, height: 600 }).loadFile('renderer.html');
