'use strict';

const chalk = require('chalk');
const config = require('../config.js');

const SEG_LENGTH = 80;
const WARN_BARE_IMPORT =
  '⚠️  re-writing bare imports because browsers do not yet support Node-style import identifiers';
const WARN_MISSING_EXTENSION =
  '⚠️  adding missing extensions because browsers can only resolve valid URL identifiers';
const WARN_NODE_PATH =
  '⚠️  re-writing NODE_PATH import because browsers can only resolve valid URL identifiers';
const WARN_PACKAGE_INDEX =
  '⚠️  adding missing package index.js because browsers do not support Node-style package identifiers';
const WARN_SERVER_TRANSPILE =
  '⚠️  ignoring async Promise returned when executing transpiler on a server file. Be sure to check the "isServer" argument before returning a transpiled value';

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
  set silent(value) {
    silent = value;
  }
};

/**
 * Log if not testing/silent
 *
 * @param { ...any } args
 */
function info(...args) {
  if (!config.testing && !silent) {
    console.log(' ', ...args.map(truncate));
  }
}

/**
 * Log if not testing, event if silent
 *
 * @param { ...any } args
 */
function noisyInfo(...args) {
  if (!config.testing) {
    console.log(' ', ...args.map(truncate));
  }
}

/**
 * Warn if not testing/silent
 *
 * @param { ...any } args
 */
function warn(...args) {
  if (!config.testing && !silent) {
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
 * @param { ...any } args
 */
function error(...args) {
  console.error(chalk.red.inverse(' error '), ...args);
}

/**
 * Fatal error
 *
 * @param { ...any } args
 */
function fatal(...args) {
  console.error(chalk.red.inverse(' fatal error '), ...args);
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
