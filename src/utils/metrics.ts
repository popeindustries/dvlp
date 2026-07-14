import chalk from 'chalk';
import Debug from 'debug';
import { getProjectPath } from './file.ts';
import { performance } from 'node:perf_hooks';
import type { Res } from '../types.ts';

const EVENT_NAMES = {
  bundle: 'bundle file',
  csp: 'inject CSP header',
  imports: 'rewrite imports',
  mock: 'mock response',
  response: 'response',
  scripts: 'inject HTML scripts',
  transform: 'transform file',
} as const;

const debug = Debug('dvlp:metrics');

export class Metrics {
  static readonly EVENT_NAMES = EVENT_NAMES;

  events: Map<string, [number, number]>;

  /**
   * Constructor
   */
  constructor(res: Res) {
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
   */
  recordEvent(name: string) {
    if (!this.events.has(name)) {
      this.events.set(name, [performance.now(), 0]);
    } else {
      this.events.get(name)![1] = performance.now();
    }
  }

  /**
   * Retrieve results for event with "name"
   */
  getEvent(name: string, formatted?: boolean): string | number {
    const times = this.events.get(name);
    const duration = times && times[1] > 0 ? msDiff(times) : 0;

    return formatted ? format(duration) : duration;
  }
}

/**
 * Retrieve rounded difference
 */
export function msDiff(times: [number, number]): number {
  return Math.ceil((times[1] - times[0]) * 100) / 100;
}

/**
 * Format 'duration'
 */
export function format(duration: number): string {
  const colour: 'red' | 'yellow' | 'green' =
    duration > 10 ? (duration > 100 ? 'red' : 'yellow') : 'green';
  let formatted =
    duration < 1000
      ? `${duration}ms`
      : `${Math.floor((duration / 1000) * 100) / 100}s`;

  formatted = formatted.padStart(7, ' ');

  return chalk[colour](formatted);
}
