/**
 * Convert a string to a URL-safe base64 string
 * @param { string } string
 * @param { boolean } isBase64
 */
export function toBase64Url(string, isBase64 = false) {
  const base64 = isBase64
    ? string
    : Buffer.from(string, 'utf-8').toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Convert a URL-safe base64 string to a string
 * @param { string } base64
 */
export function fromBase64Url(base64) {
  const segmentLength = base64.length % 4;

  return Buffer.from(
    base64
      .replace(/_/g, '/')
      .replace(/-/g, '+')
      .padEnd(
        base64.length + (segmentLength === 0 ? 0 : 4 - segmentLength),
        '=',
      ),
    'base64',
  ).toString('utf-8');
}
