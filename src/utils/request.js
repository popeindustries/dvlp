/**
 * @typedef { import('node:http').ClientRequest } ClientRequest
 * @typedef { import('node:http').IncomingHttpHeaders } IncomingHttpHeaders
 */

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
  'transfer-encoding',
];

/**
 * Forward request to `origin`.
 *
 * @param { Set<string> } origins
 * @param { Req } req
 * @param { Res } res
 */
export async function forwardRequest(origins, req, res) {
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
      const statusCode = /** @type { number } */ (fwdResponse.statusCode);

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

/**
 * @param { ClientRequest } fwdRequest
 * @returns { Promise<import('node:http').IncomingMessage> }
 */
function getForwardResponse(fwdRequest) {
  return new Promise((resolve, reject) => {
    fwdRequest.on('response', (originResponse) => {
      resolve(originResponse);
    });

    fwdRequest.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * @param { IncomingHttpHeaders } from
 * @param { Record<string, string> } to
 */
function copyRequestHeaders(from, to) {
  for (const [header, value] of Object.entries(from)) {
    if (
      !header.startsWith(':') &&
      !FORBIDDEN_REQUEST_HEADERS.includes(header)
    ) {
      to[header] = /** @type { string } */ (value);
    }
  }

  return to;
}

/**
 * @param { IncomingHttpHeaders } from
 * @param { Record<string, string> } to
 */
function copyResponseHeaders(from, to) {
  for (const [header, value] of Object.entries(from)) {
    if (!FORBIDDEN_RESPONSE_HEADERS.includes(header)) {
      to[header] = /** @type { string } */ (value);
    }
  }

  return to;
}
