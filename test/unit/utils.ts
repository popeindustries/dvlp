import { getBundlePath } from '../../src/utils/bundling.ts';
import { resolve } from '../../src/resolver/index.ts';

export function getBundleFilePath(specifier) {
  return getBundlePath(specifier, resolve(specifier));
}
