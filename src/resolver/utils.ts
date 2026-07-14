import { isBareSpecifier } from '../utils/is.ts';
import type { Package } from './types.ts';

/**
 * Retrieve package name from "specifier"
 */
export function getPackageNameFromSpecifier(
  specifier: string,
): string | undefined {
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
 */
export function isSelfReferentialSpecifier(
  specifier: string,
  pkg: Package,
): boolean {
  return getPackageNameFromSpecifier(specifier) === pkg.name;
}
