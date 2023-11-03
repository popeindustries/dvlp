import { getRepoPath } from './file.js';
import { interceptClientRequest } from './intercept-client-request.js';
import { interceptCreateServer } from './intercept-create-server.js';
import { interceptFileAccess } from './intercept-file-access.js';
import { isEqualSearchParams } from './url.js';

/**
 * @param { ApplicationProcessWorkerData | ElectronProcessWorkerData } workerData
 */
export function interceptInProcess(workerData) {
  const hostUrl = new URL(workerData.hostOrigin);
  const mocks = workerData.serializedMocks?.map((mockData) => {
    return {
      ...mockData,
      originRegex: new RegExp(mockData.originRegex),
      pathRegex: new RegExp(mockData.pathRegex),
      search: new URLSearchParams(mockData.search),
    };
  });

  // Capture application/renderer server port
  const restoreCreateServer = interceptCreateServer(
    // Default port numbers are ignored when parsed in URL
    Number(hostUrl.port || (hostUrl.protocol === 'http:' ? 80 : 443)),
    (origin) => {
      workerData.origin = origin;
      workerData.postMessage({ type: 'listening', origin });
      // Assume first server is application/renderer server
      restoreCreateServer();
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
          const href = url.href;
          url.host = hostUrl.host;
          url.search = `?dvlpmock=${encodeURIComponent(href)}`;
          break;
        }
      }
    }

    return true;
  });

  // Notify to watch project files
  interceptFileAccess((filePath, mode) => {
    if (filePath.startsWith(getRepoPath())) {
      workerData.postMessage({ type: 'watch', filePath, mode });
    }
  });
}
