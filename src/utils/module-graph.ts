import Debug from 'debug';

const debug = Debug('dvlp:modulegraph');
const importersByFile = new Map<string, Set<string>>();
const importsByFile = new Map<string, Set<string>>();

/**
 * Record that "importer" imports "imported".
 * Called during import rewriting, so edges exist for all served js/css files.
 */
export function addModuleGraphEdge(importer: string, imported: string): void {
  let imports = importsByFile.get(importer);
  let importers = importersByFile.get(imported);

  if (imports === undefined) {
    importsByFile.set(importer, (imports = new Set()));
  }
  if (importers === undefined) {
    importersByFile.set(imported, (importers = new Set()));
  }

  if (!imports.has(imported)) {
    debug(`edge "${importer}" -> "${imported}"`);
    imports.add(imported);
    importers.add(importer);
  }
}

/**
 * Clear the outgoing edges of "importer" ahead of re-recording them,
 * so imports removed from the file don't linger as stale edges
 */
export function clearModuleGraphImports(importer: string): void {
  const imports = importsByFile.get(importer);

  if (imports === undefined) {
    return;
  }

  for (const imported of imports) {
    importersByFile.get(imported)?.delete(importer);
  }
  imports.clear();
}

/**
 * Determine if "filePath" is a known node in the module graph
 */
export function isInModuleGraph(filePath: string): boolean {
  return importersByFile.has(filePath) || importsByFile.has(filePath);
}

/**
 * Walk up the graph from "filePath" collecting root owners:
 * nodes reachable via importers of which "isTraversable" holds,
 * that themselves have no traversable importers.
 * Returns an empty array when "filePath" is not in the graph.
 */
export function findModuleGraphOwners(
  filePath: string,
  isTraversable: (filePath: string) => boolean,
): Array<string> {
  if (!importersByFile.has(filePath)) {
    return [];
  }

  const owners = new Set<string>();
  const visited = new Set<string>();
  const queue = [filePath];

  while (queue.length > 0) {
    const current = queue.shift() as string;

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const importers = importersByFile.get(current);
    let hasTraversableImporter = false;

    if (importers !== undefined) {
      for (const importer of importers) {
        if (isTraversable(importer)) {
          hasTraversableImporter = true;
          queue.push(importer);
        }
      }
    }

    if (!hasTraversableImporter && current !== filePath) {
      owners.add(current);
    }
  }

  return Array.from(owners);
}

/**
 * Clear all module graph edges
 */
export function clearModuleGraph(): void {
  importersByFile.clear();
  importsByFile.clear();
}
