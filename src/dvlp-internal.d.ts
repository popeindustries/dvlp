export function bootstrapElectron(): Promise<void>;
export function filePathToUrlPathname(filePath: string): string;
export function getDependencies(
  filePath: string,
  platform: 'browser' | 'node',
): Set<string>;
export function getElectronWorkerData(): ElectronProcessWorkerData;
export function interceptClientRequest(fn: (url: URL) => boolean): () => void;
export function interceptCreateServer(
  reservedPort: number,
  fn: (port: number) => void,
): () => void;
export function interceptInProcess(
  workerData: ApplicationProcessWorkerData | ElectronProcessWorkerData,
): void;
export function isEqualSearchParams(
  params1: URLSearchParams,
  params2: URLSearchParams,
): boolean;
