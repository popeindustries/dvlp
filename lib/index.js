'use strict';

require('./config.js');
const server = require('./server.js');
const testServer = require('./testServer.js');

module.exports = {
  server,
  testServer
};