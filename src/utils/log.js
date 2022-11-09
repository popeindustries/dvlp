import chalk from 'chalk';
import config from '../config.js';

export const WARN_BARE_IMPORT = `${chalk.yellow('⚠️')} re-writing bare import`;
export const WARN_MISSING_EXTENSION = `${chalk.yellow(
  '⚠️',
)} adding missing file extension for`;
export const WARN_PACKAGE_INDEX = `${chalk.yellow(
  '⚠️',
)} adding missing package "index.js"`;
export const WARN_CERTIFICATE_EXPIRY = `${chalk.yellow(
  '⚠️',
)} ssl certificate will expire soon!`;

const SEG_LENGTH = 80;

const seenWarnings = new Set();
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
    console.log(truncate(' ' + msg.replace(/\\/g, '/')));
  }
}

/**
 * Log if not testing, even if silent
 *
 * @param { string } msg
 */
export function noisyInfo(msg) {
  if (!config.testing) {
    console.log(truncate(' ' + msg.replace(/\\/g, '/')));
  }
}

/**
 * Warn if not testing/silent
 *
 * @param { ...unknown } args
 */
export function warn(...args) {
  if (!config.testing && !silent) {
    const warning = args.join(' ');

    // Only warn one time
    if (seenWarnings.has(warning)) {
      return;
    }
    seenWarnings.add(warning);

    console.warn(warning);
  }
}

/**
 * Warn if not testing, even if silent
 *
 * @param { ...unknown } args
 */
export function noisyWarn(...args) {
  const initialValue = silent;
  silent = false;
  warn(...args);
  silent = initialValue;
}

/**
 * Error
 *
 * @param { ...unknown } args
 */
export function error(...args) {
  if (!config.testing) {
    console.error('\n', chalk.red.inverse(' error '), ...args, '\n');
  }
}

/**
 * Fatal error
 *
 * @param { ...unknown } args
 */
export function fatal(...args) {
  if (!config.testing) {
    console.error('\n', chalk.red.inverse(' fatal error '), ...args, '\n');
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
