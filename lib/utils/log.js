'use strict';

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
    console.log(...args);
  }
}

/**
 * Warn if not testing
 * @param {*} args
 */
function warn(...args) {
  if (!testing) {
    console.warn(...args);
  }
}
