/**
 * Parse `workerData` from argv passed to Electron child process
 */
export function getElectronWorkerData() {
  const workerDataArgv = process.argv[process.argv.indexOf('--workerData') + 1];

  if (workerDataArgv) {
    const workerData = /** @type { ElectronProcessWorkerData } */ (
      JSON.parse(Buffer.from(workerDataArgv, 'base64').toString('utf-8'))
    );
    workerData.postMessage = (msg) => process.send?.(msg);

    return workerData;
  }
}
