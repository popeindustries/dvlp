'use strict';

const chalk = require('chalk');
const { testing } = require('../config');

const WARN_BARE_IMPORT =
  '⚠️  re-writing bare imports because browsers do not yet support Node-style import identifiers';
const WARN_MISSING_EXTENSION =
  '⚠️  adding missing extensions because browsers can only resolve valid URL identifiers';
const WARN_NODE_PATH =
  '⚠️  re-writing NODE_PATH import because browsers can only resolve valid URL identifiers';
const WARN_NO_MOCK = '⚠️  mocking not supported for static servers';
const WARN_PACKAGE_INDEX =
  '⚠️  adding missing package index.js because browsers do not support Node-style package identifiers';

let maxBareImport = 1;
let maxMissingExtension = 1;
let maxNodePath = 1;
let maxPackageIndex = 1;

module.exports = {
  WARN_BARE_IMPORT,
  WARN_MISSING_EXTENSION,
  WARN_NODE_PATH,
  WARN_NO_MOCK,
  WARN_PACKAGE_INDEX,
  info,
  warn,
  error,
  fatal
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
      case WARN_BARE_IMPORT:
        if (maxBareImport-- > 0) {
          msg = `${WARN_BARE_IMPORT}`;
        }
        break;
      case WARN_NODE_PATH:
        if (maxNodePath-- > 0) {
          msg = `${WARN_NODE_PATH}`;
        }
        break;
      case WARN_NO_MOCK:
        msg = `${WARN_NO_MOCK}`;
        break;
      case WARN_MISSING_EXTENSION:
        if (maxMissingExtension-- > 0) {
          msg = `${WARN_MISSING_EXTENSION}`;
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
  console.error(chalk.red.inverse(' error '), ...args);
}

/**
 * Error if not testing
 * @param {*} args
 */
function fatal(...args) {
  console.error(chalk.red.inverse(' fatal error '), ...args);
}
