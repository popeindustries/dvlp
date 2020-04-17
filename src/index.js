'use strict';

require('./config.js');

exports.server = require('./server/index.js');
exports.testServer = require('./test-server/index.js');
exports.getDefaultRollupConfig = require('./utils/default-rollup-config.js').getDefaultRollupConfig;
