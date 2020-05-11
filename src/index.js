'use strict';

require('./config.js');

exports.server = require('./server/index.js');
exports.testServer = require('./test-server/index.js');
exports.getDefaultRollupConfig = require('./bundler/default-rollup-config.js').getDefaultRollupConfig;
