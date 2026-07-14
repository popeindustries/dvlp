import type { ApplicationProcessWorkerData } from '../application-host/types.ts';
import type { ElectronProcessWorkerData } from '../electron-host/types.ts';
import { getRepoPath } from './file.ts';
import { interceptClientRequest } from './intercept-client-request.ts';
import { interceptCreateServer } from './intercept-create-server.ts';
import { interceptFileAccess } from './intercept-file-access.ts';
import { isEqualSearchParams } from './url.ts';

export function interceptInProcess(
  workerData: ApplicationProcessWorkerData | ElectronProcessWorkerData,
) {
  const hostUrl = new URL(workerData.hostOrigin);
  const mocks = workerData.serializedMocks?.map((mockData) => {
    return {
      ...mockData,
      originRegex: new RegExp(mockData.originRegex),
      pathRegex: new RegExp(mockData.pathRegex),
      search: new URLSearchParams(mockData.search),
    };
  });

  // Capture application/renderer server ports
  interceptCreateServer(
    // Default port numbers are ignored when parsed in URL
    Number(hostUrl.port || (hostUrl.protocol === 'http:' ? 80 : 443)),
    (origin) => {
      workerData.postMessage({ type: 'listening', origin });
    },
  );

  // Redirect mocked request to host
  interceptClientRequest((url) => {
    if (mocks) {
      for (const mock of mocks) {
        if (
          !mock.originRegex.test(url.origin) ||
          (!mock.ignoreSearch &&
            mock.search &&
            !isEqualSearchParams(url.searchParams, mock.search))
        ) {
          continue;
        }

        if (mock.pathRegex.exec(url.pathname) != null) {
          const { href } = url;
          // Reroute back to host server
          url.protocol = 'http:';
          url.host = hostUrl.host;
          url.search = `?dvlpmock=${encodeURIComponent(href)}`;
          return true;
        }
      }
    }

    return false;
  });

  // Notify to watch project files
  interceptFileAccess((filePath, mode) => {
    if (filePath.startsWith(getRepoPath())) {
      workerData.postMessage({ type: 'watch', filePath, mode });
    }
  });
}
