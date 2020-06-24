'use strict';

module.exports = {
  getDeterministicPort,
};

/**
 * Get deterministic port number based on passed 'string'
 *
 * @param { string } string
 * @param { number } min
 * @param { number } max
 * @returns { number }
 */
function getDeterministicPort(string, min, max) {
  let hash = 0;
  let i = 0;
  let length = string.length;

  if (length > 0) {
    while (i < length) {
      hash = ((hash << 5) - hash + string.charCodeAt(i++)) | 0;
    }
  }

  return (Math.abs(hash) % (max - min)) + min;
}
