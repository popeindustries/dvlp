const { server } = require('../lib/index.js');
const { spawn } = require('child_process');

(async function() {
  const app = await server('test-browser/fixtures/app.js', {
    mockpath: 'test-browser/fixtures/mocks',
    port: 3000,
    reload: false
  });
  const cypress = spawn('./node_modules/.bin/cypress', ['run'], {
    stdio: 'inherit'
  });
  cypress.on('close', () => {
    app.destroy();
  });
})();
