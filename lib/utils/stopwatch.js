'use strict';

const chalk = require('chalk');

const timers = {};

module.exports = {
  start,
  pause,
  stop,
  clear,
  msDiff
};

/**
 * Start timer with 'id'
 * @param {string} id
 */
function start(id) {
  if (!timers[id]) {
    timers[id] = {
      start: 0,
      elapsed: 0
    };
  }
  timers[id].start = process.hrtime();
}

/**
 * Pause timer with 'id'
 * @param {string} id
 */
function pause(id) {
  if (!timers[id]) {
    return start(id);
  }

  timers[id].elapsed += msDiff(process.hrtime(), timers[id].start);
}

/**
 * Stop timer with 'id' and return elapsed
 * @param {string} id
 * @param {boolean} formatted
 * @param {boolean} padded
 * @returns {number|string}
 */
function stop(id, formatted, padded) {
  const elapsed = timers[id].elapsed + msDiff(process.hrtime(), timers[id].start);

  clear(id);
  return formatted ? format(elapsed, padded ? 5 : 0) : elapsed;
}

/**
 * clear timer with 'id'
 * @param {string} id
 */
function clear(id) {
  delete timers[id];
}

/**
 * Retrieve difference in ms
 * @param {array} t1
 * @param {array} t2
 * @returns {number}
 */
function msDiff(t1, t2) {
  t1 = (t1[0] * 1e9 + t1[1]) / 1e6;
  t2 = (t2[0] * 1e9 + t2[1]) / 1e6;
  return Math.ceil((t1 - t2) * 100) / 100;
}

/**
 * Format 'duration'
 * @param {number} duration
 * @param {number} [length]
 * @returns {string}
 */
function format(duration, length) {
  const colour = duration > 10 ? (duration > 100 ? 'red' : 'yellow') : 'green';
  let formatted =
    duration < 1000 ? `${Math.round(duration)}ms` : `${Math.floor((duration / 1000) * 100) / 100}s`;

  if (length && 'padStart' in String.prototype) {
    formatted = formatted.padStart(length, ' ');
  }

  return chalk[colour](formatted);
}
