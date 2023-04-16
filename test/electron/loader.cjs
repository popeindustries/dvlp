const { protocol } = require('electron');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'foo',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

import('./load-file.js');
