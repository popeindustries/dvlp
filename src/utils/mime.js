import config from '../config.js';
import path from 'node:path';

const TYPES = {
  'text/css': config.extensionsByType.css,
  'text/html': config.extensionsByType.html,
  'application/javascript': config.extensionsByType.js.filter(
    (ext) => ext !== '.json',
  ),
  'application/json': ['.json', '.json5'],
  'image/gif': ['.gif'],
  'image/jpeg': ['.jpeg', '.jpg', '.jpe'],
  'image/png': ['.png'],
  'image/svg+xml': ['.svg', '.svgz'],
  'image/webp': ['.webp'],
  'font/otf': ['.otf'],
  'font/ttf': ['.ttf'],
  'font/woff': ['.woff'],
  'font/woff2': ['.woff2'],
};

/**
 * Retrieve the mime type for 'filePath'
 *
 * @param { string } filePath
 */
export function getType(filePath) {
  const ext = path.extname(filePath);

  for (const [type, extensions] of Object.entries(TYPES)) {
    if (extensions.includes(ext)) {
      return type;
    }
  }

  return 'application/octet-stream';
}
