import { isBareSpecifier } from '../utils/is.js';

/**
 * Retrieve package name from "specifier"
 *
 * @param { string } specifier
 * @returns { string | undefined }
 */
export function getPackageNameFromSpecifier(specifier) {
  if (isBareSpecifier(specifier)) {
    const segments = specifier.split('/');
    let name = segments[0];

    if (name.startsWith('@')) {
      name += `/${segments[1]}`;
    }

    return name;
  }
}

/**
 * Determine whether "specifier" is self-referential based on "pkg"
 *
 * @param { string } specifier
 * @param { Package } pkg
 * @returns { boolean }
 */
export function isSelfReferentialSpecifier(specifier, pkg) {
  return getPackageNameFromSpecifier(specifier) === pkg.name;
}
