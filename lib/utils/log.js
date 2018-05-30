'use strict';

const chalk = require('chalk');

/*
const WARN_NO_FILE = '⚠️ unable to resolve file for url %s';
const WARN_MISSING_EXTENSION = '⚠️ missing extension for url %s';
const WARN_BARE_IMPORT = '⚠️ bare import';
const WARN_PACKAGE_INDEX = '⚠️ package index';
*/

const testing = process.env.NODE_ENV === 'test';

module.exports = {
  info,
  warn
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
    console.warn(' ', chalk.yellow.inverse(' warning '), ...args);
  }
}
