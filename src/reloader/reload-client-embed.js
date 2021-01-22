'use strict';

const config = require('../config.js');
const fs = require('fs');
const path = require('path');

const reloadClient = global.$RELOAD_CLIENT || fs.readFileSync(path.resolve(__dirname, 'reload-client.js'), 'utf8');

module.exports = {
  /**
   * Retrieve embeddable reload client script
   *
   * @param { number } port
   */
  getReloadClientEmbed(port) {
    return reloadClient.replace(/\$RELOAD_PORT/g, String(port)).replace(/\$RELOAD_PATHNAME/g, config.reloadEndpoint);
  },
};
