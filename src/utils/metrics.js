import chalk from 'chalk';
import Debug from 'debug';
import { getProjectPath } from './file.js';
import { performance } from 'node:perf_hooks';

const EVENT_NAMES = {
  bundle: 'bundle file',
  csp: 'inject CSP header',
  imports: 'rewrite imports',
  mock: 'mock response',
  response: 'response',
  scripts: 'inject HTML scripts',
  transform: 'transform file',
};

const debug = Debug('dvlp:metrics');

export class Metrics {
  /**
   * Constructor
   *
   * @param { Res } res
   */
  constructor(res) {
    /** @type { Map<string, [number, number]> } */
    this.events = new Map();
    this.recordEvent(EVENT_NAMES.response);
    res.once('finish', () => {
      this.recordEvent(EVENT_NAMES.response);
      if (debug.enabled) {
        let results = '';
        for (const [name, times] of this.events) {
          if (times[1] > 0) {
            results += `    ${name}: ${this.getEvent(name, true)}\n`;
          }
        }
        debug(getProjectPath(res.url));
        console.log(results);
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
}

Metrics.EVENT_NAMES = EVENT_NAMES;

/**
 * Retrieve rounded difference
 * @param { [number, number] } times
 * @returns { number }
 */
export function msDiff(times) {
  return Math.ceil((times[1] - times[0]) * 100) / 100;
}

/**
 * Format 'duration'
 *
 * @param { number } duration - ms
 * @returns { string }
 */
export function format(duration) {
  const colour = duration > 10 ? (duration > 100 ? 'red' : 'yellow') : 'green';
  let formatted = duration < 1000 ? `${duration}ms` : `${Math.floor((duration / 1000) * 100) / 100}s`;

  formatted = formatted.padStart(7, ' ');

  return chalk[colour](formatted);
}
