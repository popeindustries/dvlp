import { encodeBundleFilePath } from '../../src/utils/bundling.js';
import { resolve } from '../../src/resolver/index.js';

export function getBundleFilePath(id) {
  return encodeBundleFilePath(id, resolve(id));
}
