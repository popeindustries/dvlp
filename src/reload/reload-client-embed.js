import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const reloadClient =
  // @ts-expect-error - global
  global.$RELOAD_CLIENT ||
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'reload-client.js'),
    'utf8',
  );

/**
 * Retrieve embeddable reload client script
 *
 * @param { number } port
 */
export function getReloadClientEmbed(port) {
  return reloadClient.replace(/\$RELOAD_PATHNAME/g, '/dvlp/reload');
}
