import Debug from 'debug';

const RE_IMPORT_MAP =
  /<script[^>]+type=['"]importmap['"][^>]*>([\s\S]*?)<\/script>/;

const debug = Debug('dvlp:importmap');
const mappedPrefixes = new Set<string>();
const mappedSpecifiers = new Set<string>();
let hasImportMap = false;

/**
 * Record specifiers covered by a "<script type="importmap">" in "html",
 * so import rewriting can leave them for the browser to resolve.
 */
export function recordImportMapFromHtml(html: string): void {
  const match = RE_IMPORT_MAP.exec(html);

  if (match === null) {
    return;
  }

  try {
    const importMap = JSON.parse(match[1]) as {
      imports?: Record<string, string>;
      scopes?: Record<string, Record<string, string>>;
    };

    collectSpecifiers(importMap.imports);
    if (importMap.scopes !== undefined) {
      for (const scopedImports of Object.values(importMap.scopes)) {
        collectSpecifiers(scopedImports);
      }
    }

    hasImportMap = true;
    debug(
      `recorded import map with ${mappedSpecifiers.size} specifiers and ${mappedPrefixes.size} prefixes`,
    );
  } catch (err) {
    debug(`error parsing import map: ${err}`);
  }
}

/**
 * Determine if "specifier" is covered by a recorded import map,
 * either exactly or via a trailing-slash prefix rule
 */
export function isMappedSpecifier(specifier: string): boolean {
  if (!hasImportMap) {
    return false;
  }
  if (mappedSpecifiers.has(specifier)) {
    return true;
  }

  for (const prefix of mappedPrefixes) {
    if (specifier.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Clear all recorded import map specifiers
 */
export function clearImportMap(): void {
  mappedPrefixes.clear();
  mappedSpecifiers.clear();
  hasImportMap = false;
}

function collectSpecifiers(imports?: Record<string, string>): void {
  if (imports === undefined) {
    return;
  }

  for (const specifier of Object.keys(imports)) {
    if (specifier.endsWith('/')) {
      mappedPrefixes.add(specifier);
    } else {
      mappedSpecifiers.add(specifier);
    }
  }
}
