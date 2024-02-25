import chalk from 'chalk';

export const WARN_BARE_IMPORT = `${chalk.yellow('⚠️')} re-writing bare import`;
export const WARN_MISSING_EXTENSION = `${chalk.yellow(
  '⚠️',
)} adding missing file extension for`;
export const WARN_PACKAGE_INDEX = `${chalk.yellow(
  '⚠️',
)} adding missing package "index.js" for`;
export const WARN_CERTIFICATE_EXPIRY = `${chalk.yellow(
  '⚠️',
)} ssl certificate will expire soon!`;

const SEG_LENGTH = 80;

const seenWarnings = new Set();
let level = 1;

export default {
  /**
   * Set silent state
   *
   * @param { boolean } value
   */
  set silent(value) {
    level = 0;
  },
  /**
   * Set silent state
   *
   * @param { boolean } value
   */
  set verbose(value) {
    level = 2;
  },
};

/**
 * Log if verbose
 *
 * @param { string } msg
 */
export function info(msg) {
  if (level > 1) {
    console.log(truncate(' ' + msg.replace(/\\/g, '/')));
  }
}

/**
 * Log if not silent
 *
 * @param { string } msg
 */
export function noisyInfo(msg) {
  if (level > 0) {
    console.log(truncate(' ' + msg.replace(/\\/g, '/')));
  }
}

/**
 * Warn if verbose
 *
 * @param { ...unknown } args
 */
export function warn(...args) {
  if (level > 1) {
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
 * Warn if not silent
 *
 * @param { ...unknown } args
 */
export function noisyWarn(...args) {
  if (level > 0) {
    const initialLevel = level;
    level = 2;
    warn(...args);
    level = initialLevel;
  }
}

/**
 * Error
 *
 * @param { ...unknown } args
 */
export function error(...args) {
  if (level > 0) {
    console.error('\n', chalk.red.inverse(' error '), ...args, '\n');
  }
}

/**
 * Fatal error
 *
 * @param { ...unknown } args
 */
export function fatal(...args) {
  if (level > 0) {
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
