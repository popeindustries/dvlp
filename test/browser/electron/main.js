import { app, BrowserWindow, ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import Mocha from 'mocha';
import path from 'node:path';
import { server } from 'dvlp';
// @ts-expect-error - no types
import Spec from 'mocha/lib/reporters/spec.js';

const RUN_TIMEOUT = 120_000;

const { EVENT_RUN_END } = Mocha.Runner.constants;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type { Awaited<ReturnType<typeof server>> } */
let dvlpServer;

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

// NOTE: "ready" is not emitted until this ESM entry finishes evaluating,
// so a top-level "await app.whenReady()" would deadlock
app.whenReady().then(run, (err) => {
  console.error(err);
  app.exit(1);
});

async function run() {
  dvlpServer = await server('test/browser', {
    mockPath: 'test/browser/fixtures/mock',
    port: 8100,
    reload: false,
    silent: true,
  });

  // Dummy runner replaying renderer events into a terminal spec reporter
  const runner = new (class Runner extends EventEmitter {
    stats = { failures: 0, passes: 0, pending: 0, suites: 0, tests: 0 };
  })();

  new Spec(runner, {});

  ipcMain.on('electron-mocha:event', (event, name, stats, ...args) => {
    Object.assign(runner.stats, stats);

    try {
      runner.emit(name, ...args.map(deserialize));
    } catch (err) {
      console.error(err);
    }

    if (name === EVENT_RUN_END) {
      exit(runner.stats.failures > 0 ? 1 : 0);
    }
  });

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  window.webContents.on('console-message', (event, level, message) => {
    const lvl = event.level ?? level;

    if (lvl === 'error' || lvl === 3) {
      console.error(event.message ?? message);
    }
  });
  window.webContents.on('did-fail-load', (event, code, description) => {
    console.error(`failed to load test page: ${description} (${code})`);
    exit(1);
  });
  window.webContents.on('render-process-gone', (event, details) => {
    console.error(`renderer process gone: ${details.reason}`);
    exit(1);
  });

  setTimeout(() => {
    console.error(`tests timed out after ${RUN_TIMEOUT / 1000}s`);
    exit(1);
  }, RUN_TIMEOUT).unref();

  void window.loadURL(dvlpServer.origin);
}

/**
 * Destroy the server and exit with "code"
 *
 * @param { number } code
 */
async function exit(code) {
  try {
    await dvlpServer?.destroy();
  } catch {
    // exiting anyway
  }

  app.exit(code);
}

/**
 * Restore serialized "$$name" data properties as methods
 * (mocha's Runnable#serialize format)
 *
 * @param { any } arg
 */
function deserialize(arg) {
  if (arg == null || typeof arg !== 'object') {
    return arg;
  }

  for (const key of Object.keys(arg)) {
    const value = arg[key];

    if (key.startsWith('$$')) {
      arg[key.slice(2)] = () => value;
      delete arg[key];
    }
    if (value != null && typeof value === 'object') {
      deserialize(value);
    }
  }

  return arg;
}
