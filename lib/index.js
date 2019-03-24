'use strict';

require('./config.js');
const server = require('./server/index.js');
const testServer = require('./test-server/index.js');

module.exports = {
  server,
  testServer
};
