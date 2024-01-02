const { ipcRenderer } = require('electron');

window.done = () => {
  ipcRenderer.send('done');
};
