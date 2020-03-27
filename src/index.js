'use strict';

require('./config.js');

/** @type { server } */
exports.server = require('./server/index.js');
/** @type { testServer } */
// @ts-ignore
exports.testServer = require('./test-server/index.js');
