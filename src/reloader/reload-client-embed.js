import config from '../config.js';
import fs from 'fs';
import path from 'path';

const reloadClient = global.$RELOAD_CLIENT || fs.readFileSync(path.resolve(__dirname, 'reload-client.js'), 'utf8');

/**
 * Retrieve embeddable reload client script
 *
 * @param { number } port
 */
export function getReloadClientEmbed(port) {
  return reloadClient.replace(/\$RELOAD_PORT/g, String(port)).replace(/\$RELOAD_PATHNAME/g, config.reloadEndpoint);
}
