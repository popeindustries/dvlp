'use strict';

require('./config.js');
const server = require('./server.js');
const testServer = require('./test-server.js');

module.exports = {
  server,
  testServer
};
