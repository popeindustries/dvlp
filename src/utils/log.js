'use strict';

const chalk = require('chalk');

const SEG_LENGTH = 80;
const WARN_BARE_IMPORT =
  '⚠️  re-writing bare imports because browsers do not support Node-style import identifiers';
const WARN_MISSING_EXTENSION =
  '⚠️  adding missing extensions because browsers can only resolve valid URL identifiers';
const WARN_NODE_PATH =
  '⚠️  re-writing NODE_PATH import because browsers can only resolve valid URL identifiers';
const WARN_PACKAGE_INDEX =
  '⚠️  adding missing package index.js because browsers do not support Node-style package identifiers';
const WARN_SERVER_TRANSPILE =
  '⚠️  ignoring async Promise returned when executing transpiler on a server file. Be sure to check the "isServer" argument before returning a transpiled value';

const disabled = process.env.DVLP_LAUNCHER !== 'cmd';
let maxBareImport = 1;
let maxMissingExtension = 1;
let maxNodePath = 1;
let maxPackageIndex = 1;
let maxServerTranspile = 1;
let silent = false;

module.exports = {
  WARN_BARE_IMPORT,
  WARN_MISSING_EXTENSION,
  WARN_NODE_PATH,
  WARN_PACKAGE_INDEX,
  WARN_SERVER_TRANSPILE,
  info,
  noisyInfo,
  warn,
  error,
  fatal,

  /**
   * Set silent state
   *
   * @param { boolean } value
   */
  set silent(value) {
    silent = value;
  },
};

/**
 * Log if not testing/silent
 *
 * @param { string } msg
 */
function info(msg) {
  if (!disabled && !silent) {
    console.log(truncate(' ' + msg));
  }
}

/**
 * Log if not testing, even if silent
 *
 * @param { string } msg
 */
function noisyInfo(msg) {
  if (!disabled) {
    console.log(truncate(' ' + msg));
  }
}

/**
 * Warn if not testing/silent
 *
 * @param { ...unknown } args
 */
function warn(...args) {
  if (!disabled) {
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
      case WARN_SERVER_TRANSPILE:
        if (maxServerTranspile-- > 0) {
          msg = `${WARN_SERVER_TRANSPILE}`;
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
 * Error
 *
 * @param { ...unknown } args
 */
function error(...args) {
  if (!disabled) {
    console.error(chalk.red.inverse(' error '), ...args);
  }
}

/**
 * Fatal error
 *
 * @param { ...unknown } args
 */
function fatal(...args) {
  if (!disabled) {
    console.error(chalk.red.inverse(' fatal error '), ...args);
  }
}

/**
 * Truncate 'string'
 *
 * @param { string } string
 * @returns { string }
 */
function truncate(string) {
  if (string.length > SEG_LENGTH * 1.5 + 3) {
    return string.slice(0, SEG_LENGTH) + '...' + string.slice(-SEG_LENGTH / 2);
  }

  return string;
}
