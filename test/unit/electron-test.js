import { cleanBundledFiles } from '../../src/utils/bundling.js';
import config from '../../src/config.js';
import { server as serverFactory } from '../../src/dvlp.js';

let server;

// TODO: Missing X server or $DISPLAY
if (!process.env.CI) {
  describe('electron', () => {
    beforeEach(() => {
      cleanBundledFiles();
    });
    afterEach(async () => {
      config.directories = [process.cwd()];
      cleanBundledFiles();
      server && (await server.destroy());
    });

    it('should start an electron app with loadFile()', (done) => {
      serverFactory('test/unit/fixtures/electron-file.mjs', {
        electron: true,
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        srvr.electronProcess.activeProcess.on('message', (msg) => {
          if (msg === 'test:done') {
            done();
          }
        });
      });
    });
    it('should start an electron app with internal server and loadURL()', (done) => {
      serverFactory('test/unit/fixtures/electron-create-server.mjs', {
        electron: true,
        port: 8100,
        reload: false,
      }).then((srvr) => {
        server = srvr;
        srvr.electronProcess.activeProcess.on('message', (msg) => {
          if (msg === 'test:done') {
            done();
          }
        });
      });
    });
  });
}
