'use strict';

const INJECTED_SCRIPT = '<script src="http://localhost:35729/livereload.js"></script>';
const RE_BODY_TAG = /<\/body>/i;

/**
 * Inject livereload script into 'res'
 * @param {http.ServerResponse} res
 */
module.exports = function injectReloadScript(res) {
  const oldEnd = res.end;
  const oldWrite = res.write;

  // Patch write to intercept streaming response
  res.write = (chunk, ...args) => {
    return oldWrite.apply(res, [injectAtClosingBody(chunk)[0], ...args]);
  };

  // Patch end to intercept buffered response
  res.end = (data, ...args) => {
    if (data && (typeof data === 'string' || data instanceof Buffer)) {
      const length = res.getHeader('content-length');
      const [newData, newLength] = injectAtClosingBody(data);

      data = newData;
      if (!res.headersSent && length !== newLength) {
        res.setHeader('content-length', newLength);
      }
    }

    return oldEnd.apply(res, [data, ...args]);
  };
};

/**
 * Inject script tag into 'data' if it includes a closing </body>
 * @param {Buffer|string} data
 * @returns {[Buffer|string, number]}
 */
function injectAtClosingBody(data) {
  const asBuffer = data instanceof Buffer;

  if (asBuffer) {
    data = data.toString();
  }

  if (RE_BODY_TAG.test(data)) {
    data = data.replace(RE_BODY_TAG, `${INJECTED_SCRIPT}\n</body>`);
  }

  const length = Buffer.byteLength(data);

  if (asBuffer) {
    data = Buffer.from(data);
  }

  return [data, length];
}
