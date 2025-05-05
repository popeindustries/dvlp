import config from '../config.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Create directory structure:
 *  .dvlp/
 *    - <version>/
 *      - cached/
 *      - bundled/
 */
export function bootstrap() {
  const { bundleDirPath, cacheDirPath, dirPath, versionDirPath } = config;
  const bundleDirExists = fs.existsSync(bundleDirPath);
  const cacheDirExists = fs.existsSync(cacheDirPath);
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
  if (!cacheDirExists) {
    fs.mkdirSync(cacheDirPath, { recursive: true });
  }
}
