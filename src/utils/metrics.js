'use strict';

const chalk = require('chalk');
const debug = require('debug')('dvlp:metrics');
const { getProjectPath } = require('./file.js');
const { performance } = require('perf_hooks');

module.exports = class Perf {
  /**
   * Constructor
   *
   * @param { Res } res
   */
  constructor(res) {
    /** @type { Map<string, [number, number]> } */
    this.events = new Map();
    this.recordEvent('response');
    res.once('finish', () => {
      this.recordEvent('response');
      if (debug.enabled) {
        let results = '';
        for (const [name, times] of this.events) {
          if (times[1] > 0) {
            results += `\n  ${name}: ${this.getEvent(name, true)}`;
          }
        }
        debug(`metrics for "${getProjectPath(res.url)}": ${results}`);
      }
    });
  }

  /**
   * Register new event with "name",
   * or complete existing event if already registered.
   *
   * @param { string } name
   */
  recordEvent(name) {
    if (!this.events.has(name)) {
      this.events.set(name, [performance.now(), 0]);
    } else {
      // @ts-ignore
      this.events.get(name)[1] = performance.now();
    }
  }

  /**
   * Retrieve results for event with "name"
   *
   * @param { string } name
   * @param { boolean } [formatted]
   * @returns { string | number }
   */
  getEvent(name, formatted) {
    const times = this.events.get(name);
    const duration = times && times[1] > 0 ? msDiff(times) : 0;

    return formatted ? format(duration) : duration;
  }
};

/**
 * Retrieve rounded difference
 * @param { [number, number] } times
 * @returns { number }
 */
function msDiff(times) {
  return Math.ceil((times[1] - times[0]) * 100) / 100;
}

/**
 * Format 'duration'
 *
 * @param { number } duration - ms
 * @returns { string }
 */
function format(duration) {
  const colour = duration > 10 ? (duration > 100 ? 'red' : 'yellow') : 'green';
  let formatted =
    duration < 1000
      ? `${duration}ms`
      : `${Math.floor((duration / 1000) * 100) / 100}s`;

  return chalk[colour](formatted);
}
