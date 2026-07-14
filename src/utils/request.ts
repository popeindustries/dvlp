import type {
  ClientRequest,
  IncomingHttpHeaders,
  IncomingMessage,
} from 'node:http';
import type { Req, Res } from '../types.ts';
import { request } from 'node:http';
import { request as secureRequest } from 'node:https';

const FORBIDDEN_REQUEST_HEADERS = [
  'connection',
  'content-length',
  'host',
  'sec-fetch-mode',
];
const FORBIDDEN_RESPONSE_HEADERS = [
  'connection',
  'content-encoding',
  'content-length',
  'content-security-policy',
  'keep-alive',
  'strict-transport-security',
  'transfer-encoding',
];

/**
 * Forward request to `origin`.
 */
export async function forwardRequest(origins: Set<string>, req: Req, res: Res) {
  for (const origin of origins) {
    const url = new URL(origin);
    const requestOptions = {
      headers: copyRequestHeaders(req.headers, {}),
      method: req.method,
      host: url.hostname,
      path: req.url,
      port: url.port,
      protocol: url.protocol,
      rejectUnauthorized: false,
    };
    const requestFn = url.protocol === 'https:' ? secureRequest : request;
    const fwdRequest = requestFn(requestOptions);

    req.pipe(fwdRequest);

    try {
      const fwdResponse = await getForwardResponse(fwdRequest);
      const statusCode = fwdResponse.statusCode as number;

      if (statusCode !== 404) {
        res.writeHead(statusCode, copyResponseHeaders(fwdResponse.headers, {}));
        fwdResponse.pipe(res);
        return;
      }
    } catch {
      // Continue to next origin
    }
  }

  if (!res.headersSent) {
    res.writeHead(404);
    res.end();
  }
}

function getForwardResponse(
  fwdRequest: ClientRequest,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    fwdRequest.on('response', (originResponse) => {
      resolve(originResponse);
    });

    fwdRequest.on('error', (err) => {
      reject(err);
    });
  });
}

function copyRequestHeaders(
  from: IncomingHttpHeaders,
  to: Record<string, string>,
) {
  for (const [header, value] of Object.entries(from)) {
    if (
      !header.startsWith(':') &&
      !FORBIDDEN_REQUEST_HEADERS.includes(header)
    ) {
      to[header] = value as string;
    }
  }

  return to;
}

function copyResponseHeaders(
  from: IncomingHttpHeaders,
  to: Record<string, string>,
) {
  for (const [header, value] of Object.entries(from)) {
    if (!FORBIDDEN_RESPONSE_HEADERS.includes(header)) {
      to[header] = value as string;
    }
  }

  return to;
}
