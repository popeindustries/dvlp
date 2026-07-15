import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import config from '../config.ts';
import crypto from 'node:crypto';
import Debug from 'debug';
import path from 'node:path';

const debug = Debug('dvlp:deps');

/**
 * Read the persisted watch-dependency manifest for application entry "entryPath".
 * Returns an empty array when no manifest exists yet.
 */
export function readDependencyManifest(entryPath: string): Array<string> {
  const manifestPath = getManifestPath(entryPath);

  if (!existsSync(manifestPath)) {
    return [];
  }

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    debug(`error reading dependency manifest for "${entryPath}": ${err}`);
    return [];
  }
}

/**
 * Persist the watch-dependency "filePaths" for application entry "entryPath".
 * Writes the full current set, so stale entries are pruned on each write.
 */
export function writeDependencyManifest(
  entryPath: string,
  filePaths: Iterable<string>,
) {
  const manifestPath = getManifestPath(entryPath);

  try {
    mkdirSync(config.depsDirPath, { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(Array.from(filePaths)));
  } catch (err) {
    debug(`error writing dependency manifest for "${entryPath}": ${err}`);
  }
}

/**
 * Resolve the manifest file path for application entry "entryPath",
 * keyed by a hash of its absolute path to avoid collisions between apps.
 */
function getManifestPath(entryPath: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(path.resolve(entryPath))
    .digest('hex')
    .slice(0, 16);

  return path.join(config.depsDirPath, `${hash}.json`);
}
