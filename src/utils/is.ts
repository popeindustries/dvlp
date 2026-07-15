import config from '../config.ts';
import fs from 'node:fs';
import path from 'node:path';
import type { Req } from '../types.ts';

const RE_BARE_SPECIFIER = /^[^./](?!:)/; // Discard if A: (windows file path)
const RE_INVALID = /[<>:"|?*]/;
const RE_JSON = /.json$/i;
const RE_LOCALHOST = /localhost|127\.0\.0\.1/;
const RE_NODE_MODULES = /node_modules/;
const RE_TYPE_CSS = /text\/css/i;
const RE_TYPE_HTML = /text\/html/i;
const RE_TYPE_JS = /application\/javascript/i;

const realPath =
  'native' in fs.realpathSync && typeof fs.realpathSync.native === 'function'
    ? fs.realpathSync.native
    : fs.realpathSync;

/**
 * Determine if "filePath" is absolute
 */
export function isAbsoluteFilePath(filePath: string): boolean {
  return (
    'string' == typeof filePath &&
    path.isAbsolute(filePath) &&
    // Only absolute if from root
    path.resolve(filePath).startsWith(process.cwd().slice(0, 5))
  );
}

/**
 * Determine if 'id' is referencing a node_module
 */
export function isBareSpecifier(id: string): boolean {
  return RE_BARE_SPECIFIER.test(id);
}

/**
 * Determine if 'filePath' is for a bundled module file
 */
export function isBundledFilePath(filePath: string): boolean {
  return filePath.includes(config.bundleDirName);
}

/**
 * Determine if 'url' is for a bundled module file
 */
export function isBundledUrl(url: string): boolean {
  return url.includes(config.bundleDirName.replace(/\\/g, '/'));
}

/**
 * Determine if 'filePath' is for a css file
 */
export function isCssFilePath(filePath: string): boolean {
  return config.extensionsByType.css.includes(path.extname(filePath));
}

/**
 * Determine if 'req' is for a css file
 */
export function isCssRequest(req: any): req is Req {
  const filePath = new URL(req.url, 'http://localhost').pathname;
  return (
    req.type === 'css' ||
    isCssFilePath(filePath) ||
    (req.headers.accept && RE_TYPE_CSS.test(req.headers.accept))
  );
}

/**
 * Determine if 'filePath' is for an html file
 */
export function isHtmlFilePath(filePath: string): boolean {
  return config.extensionsByType.html.includes(path.extname(filePath));
}

/**
 * Determine if 'req' is for an html file
 */
export function isHtmlRequest(req: any): req is Req {
  const filePath = new URL(req.url, 'http://localhost').pathname;
  return (
    req.type === 'html' ||
    isHtmlFilePath(filePath) ||
    (req.headers.accept && RE_TYPE_HTML.test(req.headers.accept))
  );
}

/**
 * Determine if 'filePath' is invalid
 */
export function isInvalidFilePath(filePath: string): boolean {
  return RE_INVALID.test(filePath);
}

/**
 * Determine if 'filePath' is for a js file
 */
export function isJsFilePath(filePath: string): boolean {
  return config.extensionsByType.js.includes(path.extname(filePath));
}

/**
 * Determine if 'req' is for a js file
 */
export function isJsRequest(req: any): req is Req {
  const filePath = new URL(req.url, 'http://localhost').pathname;
  return (
    req.type === 'js' ||
    isJsFilePath(filePath) ||
    // Almost always '*/*'
    (req.headers.accept && RE_TYPE_JS.test(req.headers.accept))
  );
}

/**
 * Determine if 'filePath' is for a js file
 */
export function isJsonFilePath(filePath: string): boolean {
  return RE_JSON.test(filePath);
}

/**
 * Determine if 'url' is localhost
 */
export function isLocalhost(url: string): boolean {
  return RE_LOCALHOST.test(url);
}

/**
 * Determine if 'filePath' is in node_modules
 */
export function isNodeModuleFilePath(filePath: string): boolean {
  const isNodeModule = RE_NODE_MODULES.test(filePath);

  if (!isNodeModule) {
    return false;
  }

  try {
    // Resolve symlinks to determine if really a node_module
    return RE_NODE_MODULES.test(realPath(filePath));
  } catch {
    return true;
  }
}

/**
 * Determine if 'filePath' is in project source
 */
export function isProjectFilePath(filePath: string): boolean {
  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(filePath);
  }

  return filePath.includes(process.cwd()) && !isNodeModuleFilePath(filePath);
}

/**
 * Determine if "filePath" is relative
 */
export function isRelativeFilePath(filePath: string): boolean {
  return 'string' == typeof filePath && filePath.startsWith('.');
}

/**
 * Determine if "filePath" requires transformation.
 * By default, only transform ts/jsx.
 */
export function isTransformableJsFile(
  filePath: string,
  fileContents?: string,
): boolean {
  if (isJsFilePath(filePath)) {
    const extension = path.extname(filePath);

    if (extension.startsWith('.ts') || extension === '.jsx') {
      return true;
    }
  }

  return false;
}

/**
 * Determine if "filePath" contains JSX (.tsx/.jsx),
 * which requires esbuild rather than type-stripping.
 */
export function isJsxFilePath(filePath: string): boolean {
  const extension = path.extname(filePath);

  return extension === '.tsx' || extension === '.jsx';
}

/**
 * Determine if "filePath" is valid.
 * If relative, resolves against "fromDir".
 */
export function isValidFilePath(
  filePath: string,
  fromDir: string = process.cwd(),
): boolean {
  if (isRelativeFilePath(filePath)) {
    filePath = path.join(fromDir, filePath);
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}
