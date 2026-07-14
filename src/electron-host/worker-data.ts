import type { ElectronProcessWorkerData } from './types.ts';

/**
 * Parse `--workerData=` from argv passed to Electron child process
 */
export function getElectronWorkerData() {
  const key = '--workerData=';
  let workerDataArgv: string | undefined;

  for (const arg of process.argv) {
    if (arg.startsWith(key)) {
      workerDataArgv = arg.slice(key.length);
      break;
    }
  }

  if (workerDataArgv) {
    const workerData = JSON.parse(
      Buffer.from(workerDataArgv, 'base64').toString('utf-8'),
    ) as ElectronProcessWorkerData;
    workerData.postMessage = (msg) => {
      try {
        process.send?.(msg);
      } catch {
        // Ignore
      }
    };

    return workerData;
  }
}
