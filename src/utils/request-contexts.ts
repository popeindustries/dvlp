import type { ContentType, Req } from '../types.ts';
import { find, getTypeFromPath, getTypeFromRequest } from './file.ts';
import type { ImportAssertionType, RequestContext } from './types.ts';
import fs from 'node:fs';

const contextByHref = new Map<string, RequestContext>();

/**
 * Retrieve context for "req".
 * Creates new context if not already cached.
 */
export function getContextForReq(req: Req) {
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
 */
export function getContextForFilePath(filePath: string) {
  for (const context of contextByHref.values()) {
    if (context.filePath === filePath) {
      return context;
    }
  }
}

/**
 * Create new context
 */
export function createContext(
  href: string,
  assert: ImportAssertionType,
  dynamic: boolean,
  filePath: string,
  imported: boolean,
  type: ContentType,
) {
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
