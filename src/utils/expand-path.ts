import fs from 'node:fs';
import glob from 'fast-glob';
import path from 'node:path';

const RE_GLOB = /[*[{]/;
const RE_SEPARATOR = /[,;]\s?|\s/g;

/**
 * Expand "filePath" into multiple filePaths
 * Handles globs and/or separators
 */
export function expandPath(filePath: string | Array<string>): Array<string> {
  if (!filePath) {
    return [];
  }

  if (typeof filePath === 'string' && fs.existsSync(path.resolve(filePath))) {
    return [filePath];
  }

  if (Array.isArray(filePath)) {
    return filePath.reduce((filePaths: Array<string>, fp) => {
      if (fp) {
        filePaths.push(...expandPath(fp));
      }
      return filePaths;
    }, []);
  }

  RE_SEPARATOR.lastIndex = 0;
  if (RE_SEPARATOR.test(filePath)) {
    filePath = filePath.split(RE_SEPARATOR);
  }
  if (!Array.isArray(filePath)) {
    filePath = [filePath];
  }

  return filePath.reduce((filePaths: Array<string>, fp) => {
    if (RE_GLOB.test(fp)) {
      filePaths.push(...glob.sync(fp));
    } else {
      filePaths.push(fp);
    }
    return filePaths;
  }, []);
}
