'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronMocha', {
  /**
   * @param { string } name
   * @param { object } stats
   * @param { ...any } args
   */
  sendEvent(name, stats, ...args) {
    ipcRenderer.send('electron-mocha:event', name, stats, ...args);
  },
});
