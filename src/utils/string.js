/**
 * Get fingerprint of "string"
 *
 * @param { string } string
 */
export function getFingerprint(string) {
  const letters = new Set([...string.replace(/\W/g, '')]);
  let fingerprint = '';

  for (const letter of letters) {
    fingerprint += letter;
  }

  return Buffer.from(fingerprint).toString('base64');
}
