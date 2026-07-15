import type { ContentType, Req } from '../types.ts';
import { find, getTypeFromPath, getTypeFromRequest } from './file.ts';
import type { ImportAssertionType, RequestContext } from './types.ts';
import fs from 'node:fs';

const contextByFilePath = new Map<string, RequestContext>();
const contextByHref = new Map<string, RequestContext>();

/**
 * Retrieve context for "req".
 * Creates new context if not already cached.
 * The result is stashed on "req" to avoid re-resolving (url parse, type
 * detection, file existence check) at multiple points in the request pipeline.
 */
export function getContextForReq(req: Req) {
  if (req.context !== undefined && req.contextUrl === req.url) {
    return req.context;
  }

  // Ignore search params
  const url = new URL(req.url, 'http://localhost');
  const cached = contextByHref.get(url.pathname);
  const type = getTypeFromRequest(req);
  let context = cached;

  if (!(
    cached &&
    cached.type === type &&
    cached.filePath !== undefined &&
    fs.existsSync(cached.filePath)
  )) {
    const filePath = find(req, { type });

    context = {
      assert: undefined,
      dynamic: false,
      filePath,
      href: req.url,
      imported: false,
      type: type ?? getTypeFromPath(filePath),
    };

    contextByHref.set(url.pathname, context);
    indexByFilePath(context as RequestContext);
  }

  req.context = context;
  req.contextUrl = req.url;

  return context as RequestContext;
}

/**
 * Retrieve existing context for "filePath"
 */
export function getContextForFilePath(
  filePath: string,
): RequestContext | undefined {
  return contextByFilePath.get(filePath);
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
  const context = {
    assert,
    dynamic,
    filePath,
    href,
    imported,
    type,
  };

  contextByHref.set(href, context);
  indexByFilePath(context);
}

/**
 * Clear cached contexts
 */
export function clearContexts() {
  contextByFilePath.clear();
  contextByHref.clear();
}

/**
 * Index "context" by file path for reverse lookup.
 * First registered context for a file wins (multiple hrefs may map to it).
 */
function indexByFilePath(context: RequestContext) {
  if (
    context.filePath !== undefined &&
    !contextByFilePath.has(context.filePath)
  ) {
    contextByFilePath.set(context.filePath, context);
  }
}
