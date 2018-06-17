'use strict';

const chalk = require('chalk');

const WARN_BARE_IMPORT =
  '⚠️  re-writing bare imports because browsers do not yet support Node-style import identifiers';
const WARN_MISSING_EXTENSION =
  '⚠️  adding missing extensions because browsers can only resolve valid URL identifiers';
const WARN_PACKAGE_INDEX =
  '⚠️  adding missing package index.js because browsers do not support Node-style package identifiers';

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
    const [warning] = args;
    let msg = '';

    switch (warning) {
      case WARN_MISSING_EXTENSION:
        if (maxMissingExtension-- > 0) {
          msg = `${WARN_MISSING_EXTENSION}`;
        }
        break;
      case WARN_BARE_IMPORT:
        if (maxBareImport-- > 0) {
          msg = `${WARN_BARE_IMPORT}`;
        }
        break;
      case WARN_PACKAGE_INDEX:
        if (maxPackageIndex-- > 0) {
          msg = `${WARN_PACKAGE_INDEX}`;
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
