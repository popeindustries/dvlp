/**
 * Get fingerprint of "string"
 *
 * @param { string } string
 */
export function getFingerprint(string) {
  string = string.replace(/\W/g, '');
  const digestSize = 2;
  const hashes = new Uint32Array(digestSize).fill(5381);

  for (let i = 0; i < string.length; i++) {
    hashes[i % digestSize] =
      (hashes[i % digestSize] * 33) ^ string.charCodeAt(i);
  }

  return Buffer.from(
    String.fromCharCode(...new Uint8Array(hashes.buffer)),
    'binary',
  ).toString('base64');
}
