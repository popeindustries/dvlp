import type {
  ClientRequest,
  IncomingHttpHeaders,
  IncomingMessage,
} from 'node:http';
import type { Http2ServerRequest, Req, Res } from '../types.ts';
import { request } from 'node:http';
import { request as secureRequest } from 'node:https';

const BODY_KEY = Symbol('dvlp:body');

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
 * Read the full request body as a string.
 * Memoised per request, so repeated calls (and dvlp's own mock-call capture)
 * share a single read of the stream.
 */
export function readBody(
  req: IncomingMessage | Http2ServerRequest,
): Promise<string> {
  const request = req as (IncomingMessage | Http2ServerRequest) & {
    [BODY_KEY]?: Promise<string>;
  };

  request[BODY_KEY] ??= new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });

  return request[BODY_KEY];
}

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
