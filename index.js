'use strict';

require('./lib/config');
const server = require('./lib/server');
const testServer = require('./lib/testServer');

module.exports = {
  server,
  testServer
};
