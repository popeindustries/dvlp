import chalk from 'chalk';
import config from '../config.js';

export const WARN_BARE_IMPORT =
  '⚠️  re-writing bare imports because browsers do not support Node-style import identifiers';
export const WARN_MISSING_EXTENSION =
  '⚠️  adding missing extensions because browsers can only resolve valid URL identifiers';
export const WARN_PACKAGE_INDEX =
  '⚠️  adding missing package index.js because browsers do not support Node-style package identifiers';
export const WARN_SERVER_TRANSPILE =
  '⚠️  ignoring async Promise returned when executing transpiler on a server file. Be sure to check the "isServer" argument before returning a transpiled value';

const SEG_LENGTH = 80;

let maxBareImport = 1;
let maxMissingExtension = 1;
let maxPackageIndex = 1;
let maxServerTranspile = 1;
let silent = false;

export default {
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
export function info(msg) {
  if (!config.testing && !silent) {
    console.log(truncate(' ' + msg));
  }
}

/**
 * Log if not testing, even if silent
 *
 * @param { string } msg
 */
export function noisyInfo(msg) {
  if (!config.testing) {
    console.log(truncate(' ' + msg));
  }
}

/**
 * Warn if not testing/silent
 *
 * @param { ...unknown } args
 */
export function warn(...args) {
  if (!config.testing && !silent) {
    const [warning] = args;
    let msg = '';

    switch (warning) {
      case WARN_BARE_IMPORT:
        if (maxBareImport-- > 0) {
          msg = `${WARN_BARE_IMPORT}`;
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
export function error(...args) {
  if (!config.testing) {
    console.error('\n', chalk.red.inverse(' error '), ...args);
  }
}

/**
 * Fatal error
 *
 * @param { ...unknown } args
 */
export function fatal(...args) {
  if (!config.testing) {
    console.error('\n', chalk.red.inverse(' fatal error '), ...args);
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
