import config from '../config.js';
import fs from 'node:fs';
import mime from 'mime';
import path from 'node:path';
import send from 'send';

/**
 * Create directory structure:
 *  .dvlp/
 *    - <version>/
 *      - bundled/
 */
export function bootstrap() {
  const { bundleDirPath, dirPath, versionDirPath } = config;
  const bundleDirExists = fs.existsSync(bundleDirPath);
  const dirExists = fs.existsSync(dirPath);
  const subdirExists = fs.existsSync(versionDirPath);

  // New version of .dvlp, so delete existing
  if (dirExists && !subdirExists) {
    for (const item of fs.readdirSync(dirPath)) {
      fs.rmSync(path.resolve(dirPath, item), { force: true, recursive: true });
    }
  }
  if (!bundleDirExists) {
    fs.mkdirSync(bundleDirPath, { recursive: true });
  }

  mime.define(config.jsMimeTypes, true);
  // @ts-ignore
  send.mime.define(config.jsMimeTypes, true);
}
