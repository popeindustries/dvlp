import { app, BrowserWindow } from 'electron';

await app.whenReady();

new BrowserWindow({ width: 800, height: 600 }).loadFile('renderer.html');

const res = await fetch('https://www.someapi.com/v1/9012');
const json = await res.json();

console.log(json);
