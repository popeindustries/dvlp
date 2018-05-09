'use strict';

const fs = require('fs');
const path = require('path');
const ReloadServer = require('./ReloadServer');

const DEFAULT_PORT = 8080;

/**
 * Create server
 * @param {string|Array<string>} filepath
 * @param {{ port: number, reload: boolean }} options
 * @returns {Promise<{ destroy: () => null }>}
 */
module.exports = function server(
  filepath = process.cwd(),
  { port = Number(process.env.PORT) || DEFAULT_PORT, reload = true } = {}
) {
  return new Promise(async (resolve, reject) => {
    let stat, reloadServer;

    if (reload) {
      reloadServer = new ReloadServer();
      await reloadServer.start();
    }

    if (stat.isDirectory()) {
    } else {
    }
  });
};
