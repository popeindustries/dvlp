import config from '../config.js';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const reloadClient =
  global.$RELOAD_CLIENT ||
  fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'reload-client.js'), 'utf8');

/**
 * Retrieve embeddable reload client script
 *
 * @param { number } port
 */
export function getReloadClientEmbed(port) {
  return reloadClient.replace(/\$RELOAD_PORT/g, String(port)).replace(/\$RELOAD_PATHNAME/g, config.reloadEndpoint);
}
