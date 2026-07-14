import type { ContentType, Req } from '../types.ts';
import {
  isAbsoluteFilePath,
  isBundledUrl,
  isCssRequest,
  isHtmlRequest,
  isJsRequest,
  isNodeModuleFilePath,
} from './is.ts';
import { warn, WARN_MISSING_EXTENSION, WARN_PACKAGE_INDEX } from './log.ts';
import config from '../config.ts';
import type { FindOptions } from './types.ts';
import fs from 'node:fs';
import type { Package } from '../resolver/types.ts';
import { parse } from 'es-module-lexer';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FILE_TYPES: Array<ContentType> = ['js', 'css', 'html'];
const MAX_FILE_SYSTEM_DEPTH = 10;

const fileFormatCache = new Map<string, 'cjs' | 'esm'>();
const realPath =
  'native' in fs.realpathSync && typeof fs.realpathSync.native === 'function'
    ? fs.realpathSync.native
    : fs.realpathSync;
let repoPath: string;

/**
 * Validate that all file paths exist
 */
export function exists(filePaths: string | Array<string>): void {
  if (!Array.isArray(filePaths)) {
    filePaths = [filePaths];
  }

  for (const filePath of filePaths) {
    if (!fs.existsSync(path.resolve(filePath))) {
      throw Error(`path '${filePath}' does not exist`);
    }
  }
}

/**
 * Find filePath for 'req'
 */
export function find(
  req: Req | string,
  { directories = config.directories, type }: FindOptions = {},
): string | undefined {
  const href = decodeURI(
    isRequestObject(req) ? new URL(req.url, 'http://localhost').pathname : req,
  );
  let filePath;

  if (type === undefined) {
    type = isRequestObject(req)
      ? getTypeFromRequest(req)
      : getTypeFromPath(req);
  }

  // Special handling for '/node_modules...' to allow breaking out of cwd.
  // This is similar to how Node resolves package names internally.
  if (href.startsWith('/node_modules')) {
    directories = [
      ...directories,
      ...resolveNodeModulesDirectories(process.cwd()).map(
        (nodeModulesDirPath) => path.dirname(nodeModulesDirPath),
      ),
    ];
  }

  // Handle bundled js import
  if (isBundledUrl(href)) {
    // Remove leading "/"
    filePath = path.resolve(href.slice(1));
  } else if (isAbsoluteFilePath(href)) {
    filePath = resolveFilePath(href, type);
  } else {
    for (const directory of directories) {
      filePath = resolveFilePath(path.join(directory, href), type);

      if (filePath) {
        break;
      }
    }
  }

  if (!filePath) {
    return;
  }

  if (isRequestObject(req)) {
    req.filePath = filePath;
    req.type = getTypeFromPath(filePath);
  }

  return filePath;
}

/**
 * Walk parent directories looking for first file with matching "fileName"
 */
export function findClosest(fileName: string): string | undefined {
  let dir = path.resolve(fileName);
  let depth = MAX_FILE_SYSTEM_DEPTH;
  let parent;

  while (true) {
    parent = path.dirname(dir);
    // Stop if we hit max file system depth or root
    // Convert to lowercase to avoid problems on Windows
    if (!--depth || parent.toLowerCase() === dir.toLowerCase()) {
      break;
    }

    const filePath = path.resolve(dir, fileName);

    if (fs.existsSync(filePath)) {
      return filePath;
    }

    // Walk
    dir = parent;
  }
}

/**
 * Retrieve the absolute path for the project relative path "filePath"
 */
export function getAbsoluteProjectPath(filePath: string): string {
  return isAbsoluteFilePath(filePath)
    ? filePath
    : path.join(
        process.cwd(),
        filePath.charAt(0) === '/' ? filePath.slice(1) : filePath,
      );
}

/**
 * Get directory contents of path
 */
export function getDirectoryContents(dirPath: string): Array<string> {
  if (fs.statSync(dirPath).isFile()) {
    return [dirPath];
  }

  return fs
    .readdirSync(dirPath)
    .map((filePath) => path.resolve(dirPath, filePath));
}

/**
 * Retrieve the project relative path for "filePath"
 */
export function getProjectPath(filePath: string | Array<string>): string {
  if (Array.isArray(filePath)) {
    filePath = filePath[0];
  }

  const projectFilePath = isAbsoluteFilePath(filePath)
    ? path.relative(process.cwd(), filePath)
    : filePath;

  return projectFilePath.startsWith('/')
    ? projectFilePath.slice(1)
    : projectFilePath;
}

/**
 * Retrieve the repo root path
 */
export function getRepoPath(): string {
  if (repoPath === undefined) {
    const gitDir = findClosest('.git');

    repoPath = gitDir !== undefined ? path.dirname(gitDir) : process.cwd();
  }

  return repoPath;
}

/**
 * Retrieve generic file type from "filePath" extension
 */
export function getTypeFromPath(filePath?: string): ContentType | undefined {
  if (filePath !== undefined) {
    const pathname = new URL(filePath, 'http://localhost').pathname;
    return config.typesByExtension[path.extname(pathname)];
  }
}

/**
 * Retrieve resource type
 */
export function getTypeFromRequest(req: Req): ContentType | undefined {
  // Unknown file types are sent with 'Accept: text/html',
  // so try JS/CSS before HTML
  if (req.type) {
    return req.type;
  } else if (isJsRequest(req)) {
    return 'js';
  } else if (isCssRequest(req)) {
    return 'css';
  } else if (isHtmlRequest(req)) {
    return 'html';
  }
}

/**
 * Import module at 'filePath'
 */
export async function importModule<ModuleType>(
  filePath: string,
): Promise<ModuleType> {
  // @ts-expect-error - works in Node
  let module: ModuleType = await import(pathToFileURL(filePath));

  if (module != null && typeof module === 'object' && 'default' in module) {
    // @ts-expect-error - works in Node
    module = module.default;
  }

  return module;
}

/**
 * Determine if 'filePath' is referencing an esm file
 */
export function isEsmFile(filePath: string, pkg?: Package): boolean {
  const cached = fileFormatCache.get(filePath);

  if (cached !== undefined) {
    return cached === 'esm';
  }

  const extension = path.extname(filePath);
  let isEsm = false;

  if (extension === '.js') {
    if (pkg?.type === 'module') {
      isEsm = true;
    }

    if (!isEsm) {
      try {
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const [imports, exports] = parse(fileContents);
        isEsm = imports.length > 0 || exports.length > 0;
      } catch {
        isEsm = false;
      }
    }
  } else if (extension === '.mjs') {
    isEsm = true;
  }

  fileFormatCache.set(filePath, isEsm ? 'esm' : 'cjs');

  return isEsm;
}

/**
 * Resolve "filePath" of "type"
 * Handles missing extensions and package indexes
 */
function resolveFilePath(filePath: string, type?: ContentType): string {
  // prettier-ignore
  filePath = decodeURI(filePath).replace(/(\s)/g, '\$1'); // eslint-disable-line

  try {
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      return resolveRealFilePath(filePath);
    }
  } catch {
    // Not found, possibly no extension, no package, or wrong extension.
    // If unable to resolve a file that has an extension,
    // we will ignore the existing extension and try all others.
    // Since TypeScript allows adding ".js" to imports, but resolves to ".ts" files,
    // this will allow us to resolve to a ".ts" file when looking for a (missing) ".js" one.
  }

  if (type === undefined) {
    for (const ft of FILE_TYPES) {
      const fp = resolveFilePath(filePath, ft);

      if (fp) {
        return resolveRealFilePath(fp);
      }
    }

    // Default to js
    type = 'js';
  }

  const hasExtension = path.extname(filePath) !== '';
  let fp = resolveFilePathExtension(filePath, config.extensionsByType[type]);

  if (fp) {
    // Skip warning if original extension provided, even though it's invalid (TypeScript .js -> .ts)
    if (!hasExtension && !isNodeModuleFilePath(fp)) {
      warn(WARN_MISSING_EXTENSION, `"${getProjectPath(filePath)}"`);
    }
    return resolveRealFilePath(fp);
  }

  fp = resolveFilePathExtension(
    path.join(filePath, 'index'),
    config.extensionsByType[type],
  );

  if (fp && type === 'js') {
    if (!isNodeModuleFilePath(fp)) {
      warn(WARN_PACKAGE_INDEX, `"${getProjectPath(filePath)}"`);
    }
  }

  return resolveRealFilePath(fp);
}

/**
 * Resolve missing extension for "filePath"
 */
function resolveFilePathExtension(
  filePath: string,
  extensions: Array<string>,
): string {
  const ext = path.extname(filePath);

  if (ext && extensions.includes(ext)) {
    filePath = filePath.replace(ext, '');
  }

  for (const ext of extensions) {
    const fp = filePath + ext;

    if (fs.existsSync(fp)) {
      return fp;
    }
  }

  return '';
}

/**
 * Resolve real path to "filePath", even if symlinked
 */
export function resolveRealFilePath(filePath: string): string {
  if (!filePath || !path.isAbsolute(filePath)) {
    return filePath;
  }

  try {
    return realPath(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Determine whether "req" is a request object
 */
function isRequestObject(req: unknown): req is Req {
  return typeof req !== 'string';
}

/**
 * Gather all node_modules directories reachable from "filePath"
 */
export function resolveNodeModulesDirectories(filePath: string): Array<string> {
  const dirs: Array<string> = [];
  let dir = path.extname(filePath) ? path.dirname(filePath) : filePath;
  let depth = MAX_FILE_SYSTEM_DEPTH;
  let parent;

  while (true) {
    parent = path.dirname(dir);
    // Stop if we hit max file system depth or root
    // Convert to lowercase to avoid problems on Windows
    if (!--depth || parent.toLowerCase() === dir.toLowerCase()) {
      break;
    }

    const nodeModulesPath = path.resolve(dir, 'node_modules');

    if (fs.existsSync(nodeModulesPath)) {
      dirs.push(nodeModulesPath);
    }

    // Walk
    dir = parent;
  }

  return dirs.sort((a, b) => (a.length >= b.length ? -1 : 1));
}
