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
   */
  set silent(value: boolean) {
    level = 0;
  },
  /**
   * Set silent state
   */
  set verbose(value: boolean) {
    level = 2;
  },
};

/**
 * Log if verbose
 */
export function info(msg: string) {
  if (level > 1) {
    console.log(truncate(' ' + msg.replace(/\\/g, '/')));
  }
}

/**
 * Log if not silent
 */
export function noisyInfo(msg: string) {
  if (level > 0) {
    console.log(truncate(' ' + msg.replace(/\\/g, '/')));
  }
}

/**
 * Warn if verbose
 */
export function warn(...args: Array<unknown>) {
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
 */
export function noisyWarn(...args: Array<unknown>) {
  if (level > 0) {
    const initialLevel = level;
    level = 2;
    warn(...args);
    level = initialLevel;
  }
}

/**
 * Error
 */
export function error(...args: Array<unknown>) {
  if (level > 0) {
    console.error('\n', chalk.red.inverse(' error '), ...args, '\n');
  }
}

/**
 * Fatal error
 */
export function fatal(...args: Array<unknown>) {
  if (level > 0) {
    console.error('\n', chalk.red.inverse(' fatal error '), ...args, '\n');
  }
}

/**
 * Truncate 'string'
 */
function truncate(string: string): string {
  if (string.length > SEG_LENGTH * 1.5 + 3) {
    return string.slice(0, SEG_LENGTH) + '...' + string.slice(-SEG_LENGTH / 2);
  }

  return string;
}
