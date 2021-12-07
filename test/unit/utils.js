import { getBundlePath } from '../../src/utils/bundling.js';
import { resolve } from '../../src/resolver/index.js';

export function getBundleFilePath(specifier) {
  return getBundlePath(specifier, resolve(specifier));
}
