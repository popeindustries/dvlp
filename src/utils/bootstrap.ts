import config from '../config.ts';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Create directory structure:
 *  .dvlp/
 *    - cached/       (version-independent V8 compile cache)
 *    - deps/         (version-independent watch-dependency manifests)
 *    - <version>/
 *      - bundled/
 */
export function bootstrap() {
  const { bundleDirPath, cacheDirPath, depsDirPath, dirPath, versionDirPath } =
    config;
  const bundleDirExists = fs.existsSync(bundleDirPath);
  const cacheDirExists = fs.existsSync(cacheDirPath);
  const depsDirExists = fs.existsSync(depsDirPath);
  const dirExists = fs.existsSync(dirPath);
  const subdirExists = fs.existsSync(versionDirPath);

  // New version of .dvlp, so delete existing (but preserve the version-independent
  // compile cache and dependency manifests, which are keyed by their own content)
  if (dirExists && !subdirExists) {
    const preserved = new Set([cacheDirPath, depsDirPath]);

    for (const item of fs.readdirSync(dirPath)) {
      const itemPath = path.resolve(dirPath, item);

      if (!preserved.has(itemPath)) {
        fs.rmSync(itemPath, { force: true, recursive: true });
      }
    }
  }
  if (!bundleDirExists) {
    fs.mkdirSync(bundleDirPath, { recursive: true });
  }
  if (!cacheDirExists) {
    fs.mkdirSync(cacheDirPath, { recursive: true });
  }
  if (!depsDirExists) {
    fs.mkdirSync(depsDirPath, { recursive: true });
  }
}
