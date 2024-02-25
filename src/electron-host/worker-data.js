/**
 * Parse `--workerData=` from argv passed to Electron child process
 */
export function getElectronWorkerData() {
  const key = '--workerData=';
  /** @type { string | undefined } */
  let workerDataArgv;

  for (const arg of process.argv) {
    if (arg.startsWith(key)) {
      workerDataArgv = arg.slice(key.length);
      break;
    }
  }

  if (workerDataArgv) {
    const workerData = /** @type { ElectronProcessWorkerData } */ (
      JSON.parse(Buffer.from(workerDataArgv, 'base64').toString('utf-8'))
    );
    workerData.postMessage = (msg) => process.send?.(msg);

    return workerData;
  }
}
