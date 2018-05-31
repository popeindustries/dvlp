'use strict';

const chalk = require('chalk');

const RE_PRINTF = /%[sd]/g;
const WARN_BARE_IMPORT =
  '⚠️  re-writing bare import for %s (Browsers do not yet support Node-style import identifiers)';
const WARN_MISSING_EXTENSION =
  '⚠️  adding missing extension for %s (Browsers can only resolve valid URL identifiers)';
const WARN_PACKAGE_INDEX =
  '⚠️  adding missing package index.js for %s (Browsers do not support Node-style package identifiers)';

const testing = process.env.NODE_ENV === 'test';
let maxMissingExtension = 1;
let maxBareImport = 1;
let maxPackageIndex = 1;

module.exports = {
  WARN_BARE_IMPORT,
  WARN_MISSING_EXTENSION,
  WARN_PACKAGE_INDEX,
  info,
  warn,
  error
};

/**
 * Log if not testing
 * @param {*} args
 */
function info(...args) {
  if (!testing) {
    console.log(' ', ...args);
  }
}

/**
 * Warn if not testing
 * @param {*} args
 */
function warn(...args) {
  if (!testing) {
    let [warning, ...params] = args;
    let msg = '';

    params = params.map((param) => chalk.yellow(param));

    switch (warning) {
      case WARN_MISSING_EXTENSION:
        if (maxMissingExtension-- > 0) {
          msg = printf(WARN_MISSING_EXTENSION, ...params);
        }
        break;
      case WARN_BARE_IMPORT:
        if (maxBareImport-- > 0) {
          msg = printf(WARN_BARE_IMPORT, ...params);
        }
        break;
      case WARN_PACKAGE_INDEX:
        if (maxPackageIndex-- > 0) {
          msg = printf(WARN_PACKAGE_INDEX, ...params);
        }
        break;
      default:
        msg = args.join(' ');
    }

    if (msg) {
      console.warn(msg);
    }
  }
}

/**
 * Error if not testing
 * @param {*} args
 */
function error(...args) {
  if (!testing) {
    console.error(chalk.red.inverse(' error '), ...args);
  }
}

/**
 * Substitute tokens (%s, %d) in 'str'
 * @param {String} str
 * @returns {String}
 */
function printf(str, ...args) {
  const length = args.length;
  let i = 0;

  return String(str).replace(RE_PRINTF, (token) => {
    if (i >= length) {
      return '';
    }

    switch (token) {
      case '%s':
        return String(args[i++]);
      case '%d':
        return Number(args[i++]);
      default:
        return token;
    }
  });
}
