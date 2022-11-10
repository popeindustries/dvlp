import { find, getTypeFromPath, getTypeFromRequest } from './file.js';
import fs from 'node:fs';

/** @type { Map<string, RequestContext> } */
const contextByHref = new Map();

/**
 * Retrieve context for "req".
 * Creates new context if not already cached.
 *
 * @param { Req } req
 */
export function getContextForReq(req) {
  // Ignore search params
  const url = new URL(req.url, 'http://localhost');
  const cached = contextByHref.get(url.pathname);
  const type = getTypeFromRequest(req);

  if (
    cached &&
    cached.type === type &&
    cached.filePath !== undefined &&
    fs.existsSync(cached.filePath)
  ) {
    return cached;
  }

  const filePath = find(req, { type });
  const context = {
    assert: undefined,
    dynamic: false,
    filePath,
    href: req.url,
    imported: false,
    type: type ?? getTypeFromPath(filePath),
  };

  contextByHref.set(url.pathname, context);

  return context;
}

/**
 * Retrieve existing context for "filePath"
 *
 * @param { string } filePath
 */
export function getContextForFilePath(filePath) {
  for (const context of contextByHref.values()) {
    if (context.filePath === filePath) {
      return context;
    }
  }
}

/**
 * Create new context
 *
 * @param { string } href
 * @param { ImportAssertionType } assert
 * @param { boolean } dynamic
 * @param { string } filePath
 * @param { boolean } imported
 * @param { ContentType } type
 */
export function createContext(href, assert, dynamic, filePath, imported, type) {
  contextByHref.set(href, {
    assert,
    dynamic,
    filePath,
    href,
    imported,
    type,
  });
}

/**
 * Clear cached contexts
 */
export function clearContexts() {
  contextByHref.clear();
}
