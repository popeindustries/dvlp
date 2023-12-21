import { request } from 'node:http';
import { request as secureRequest } from 'node:https';

const CONNECTION_HEADERS = [
  'connection',
  'upgrade',
  'http2-settings',
  'te',
  'transfer-encoding',
  'proxy-connection',
  'keep-alive',
  'host',
];

/**
 * Forward request to `origin`.
 *
 * @param { string } origin
 * @param { Req } req
 * @param { Res } res
 */
export function forwardRequest(origin, req, res) {
  /** @type { Record<string, string> } */
  const headers = {
    // @ts-ignore
    // host: req.headers.host || req.headers[':authority'],
  };

  // Prune headers
  for (const header in req.headers) {
    if (
      header &&
      !header.startsWith(':') &&
      !CONNECTION_HEADERS.includes(header)
    ) {
      // @ts-ignore
      headers[header] = req.headers[header];
    }
  }

  const url = new URL(origin);
  const requestOptions = {
    headers,
    method: req.method,
    host: url.hostname,
    path: req.url,
    port: url.port,
    protocol: url.protocol,
    rejectUnauthorized: false,
  };
  const requestFn = url.protocol === 'https:' ? secureRequest : request;
  const fwdRequest = requestFn(requestOptions, (originResponse) => {
    const { statusCode, headers } = originResponse;

    delete headers.connection;
    delete headers['keep-alive'];

    res.writeHead(statusCode || 200, headers);
    originResponse.pipe(res);
  });

  fwdRequest.on('error', (err) => {
    res.writeHead(500);
    res.end(err.message);
  });

  req.pipe(fwdRequest);
}
