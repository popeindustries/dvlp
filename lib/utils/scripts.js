'use strict';

const crypto = require('crypto');

module.exports = {
  concatScripts,
  getProcessEnvString,
  hashScript
};

/**
 * Retrieve process.env polyfill
 *
 * @returns { string }
 */
function getProcessEnvString() {
  return `window.process=window.process||{env:{}};window.process.env.NODE_ENV="${process
    .env.NODE_ENV || 'development'}"`;
}

/**
 * Concatenate multiple "scripts" into a single string
 *
 * @param { Array<string> } scripts
 * @return { string }
 */
function concatScripts(scripts) {
  return scripts.filter((script) => !!script).join('\n');
}

/**
 * Retrieve sha256 hash of "script"
 *
 * @param { string } script
 * @returns { string }
 */
function hashScript(script) {
  return crypto
    .createHash('sha256')
    .update(script)
    .digest('base64');
}
