import { bootstrap } from '../../src/utils/bootstrap.js';
import config from '../../src/config.js';
import fs from 'node:fs';

if (config.testing) {
  process.on('exit', () => {
    fs.rmSync(config.dirPath, { force: true, recursive: true });
  });
}

bootstrap();
