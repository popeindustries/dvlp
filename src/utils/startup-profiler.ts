import { fileURLToPath } from 'node:url';
import module from 'node:module';
import { performance } from 'node:perf_hooks';

const MODE = process.env.DVLP_PROFILE;
const PROFILE_MODULES = MODE === 'modules' || MODE === 'verbose';
const ORIGIN_ENV = 'DVLP_PROFILE_T0';
const RE_TS = /\.[cm]?tsx?$/;

/**
 * Whether startup profiling is enabled (via DVLP_PROFILE env).
 */
export function isStartupProfilingEnabled(): boolean {
  return MODE !== undefined;
}

/**
 * Shared wall-clock origin (ms) for the whole `dvlp` invocation.
 * Set once in the main process and inherited by spawned child/worker
 * processes via the environment, so elapsed times are comparable end-to-end.
 */
export function getStartupOrigin(): number {
  const existing = process.env[ORIGIN_ENV];

  if (existing !== undefined) {
    return Number(existing);
  }

  const now = Date.now();
  process.env[ORIGIN_ENV] = String(now);

  return now;
}

/**
 * Create a startup profiler for "label", or a no-op when profiling is disabled.
 * Pass `trackModules` to record per-module load/strip stats in the process
 * doing the importing (requires DVLP_PROFILE=modules).
 */
export function createStartupProfiler(
  label: string,
  options: { trackModules?: boolean } = {},
): StartupProfiler {
  return new StartupProfiler(label, options);
}

export class StartupProfiler {
  #label: string;
  #origin: number;
  #enabled: boolean;
  #lastMark: number;
  #moduleCount = 0;
  #tsCount = 0;
  #loadMs = 0;

  /**
   * Constructor
   */
  constructor(label: string, options: { trackModules?: boolean } = {}) {
    this.#label = label;
    this.#enabled = isStartupProfilingEnabled();
    this.#origin = this.#enabled ? getStartupOrigin() : Date.now();
    this.#lastMark = this.#origin;

    if (this.#enabled && PROFILE_MODULES && options.trackModules) {
      this.#registerLoadHook();
    }
  }

  /**
   * Log elapsed time (since origin) and delta (since previous mark) for "name"
   */
  mark(name: string) {
    if (!this.#enabled) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.#origin;
    const delta = now - this.#lastMark;
    this.#lastMark = now;

    this.#write(`${name.padEnd(24)} +${elapsed}ms (Δ${delta}ms)`);
  }

  /**
   * Log accumulated module-load stats (requires DVLP_PROFILE=modules)
   */
  report() {
    if (!this.#enabled || !PROFILE_MODULES) {
      return;
    }

    const loadMs = Math.round(this.#loadMs);

    this.#write(
      `modules loaded: ${this.#moduleCount} (${this.#tsCount} ts), ` +
        `cumulative load+strip: ${loadMs}ms`,
    );
  }

  #registerLoadHook() {
    if (typeof module.registerHooks !== 'function') {
      this.#write('module.registerHooks unavailable — skipping module profile');
      return;
    }

    module.registerHooks({
      load: (url, context, nextLoad) => {
        const start = performance.now();
        const result = nextLoad(url, context);
        this.#loadMs += performance.now() - start;
        this.#moduleCount++;

        if (RE_TS.test(pathnameOf(url))) {
          this.#tsCount++;
        }

        return result;
      },
    });
  }

  #write(message: string) {
    process.stderr.write(`  ⏱  [dvlp:profile:${this.#label}] ${message}\n`);
  }
}

/**
 * Best-effort pathname for a module "url" (file: URL or plain path)
 */
function pathnameOf(url: string): string {
  return url.startsWith('file://') ? fileURLToPath(url) : url;
}
