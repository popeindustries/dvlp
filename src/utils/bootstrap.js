import config from '../config.js';
import fs from 'node:fs';
import path from 'node:path';

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
}
