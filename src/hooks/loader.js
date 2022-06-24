import { pathToFileURL } from 'url';
import { writeFileSync } from 'fs';

const t = String.raw;

/**
 * Create application loader based on passed hooks
 *
 * @param { import('url').URL } loaderPath
 * @param { { jsExtensions: Array<string>, hooks?: Hooks, hooksPath?: string } } hooksConfig
 */
export function createApplicationLoader(loaderPath, hooksConfig) {
  const hooksPath =
    hooksConfig.hooks && (hooksConfig.hooks.onServerTransform || hooksConfig.hooks.onServerResolve)
      ? pathToFileURL(/** @type { string } */ (hooksConfig.hooksPath)).href
      : undefined;
  const contents = getLoaderContents(hooksConfig.jsExtensions, hooksPath);

  writeFileSync(loaderPath, contents);
}

/**
 * @param { Array<string> } jsExtensions
 * @param { string } [hooksPath]
 */
function getLoaderContents(jsExtensions, hooksPath) {
  return t`
  import { fileURLToPath, pathToFileURL } from 'url';
  import { esbuild, resolve as dvlpResolve } from 'dvlp';
  import { extname } from 'path';
  import fs from 'fs';
  ${hooksPath ? `import customHooks from '${hooksPath}';` : 'const customHooks = {};'}

  global.sources = new Set();

  const BASE_URL = pathToFileURL(process.cwd() + '/').href;
  const IS_WIN32 = process.platform === 'win32';
  const RE_EXTS = /\.(tsx?|json)$/;
  const RE_IGNORE = /^[^.]/
  let originalDefaultResolve;
  let originalDefaultLoad;
  let originalDefaultTransformSource;

  export function resolve(specifier, context, defaultResolve) {
    if (originalDefaultResolve === undefined) {
      originalDefaultResolve = defaultResolve;
    }
    if (customHooks.onServerResolve !== undefined) {
      return customHooks.onServerResolve(specifier, context, doResolve);
    }

    return doResolve(specifier, context);
  }

  function doResolve(specifier, context) {
    if (!specifier.startsWith('node:')) {
      const resolved = dvlpResolve(specifier, context.parentURL ? fileURLToPath(context.parentURL) : undefined, 'server');
      if (resolved) {
        return { url: pathToFileURL(resolved).href };
      }
    }

    return originalDefaultResolve(specifier, context, originalDefaultResolve);
  }

  export function load(url, context, defaultLoad) {
    if (originalDefaultLoad === undefined) {
      originalDefaultLoad = defaultLoad;
    }

    storeSourcePath(url);

    if (customHooks.onServerTransform !== undefined) {
      return customHooks.onServerTransform(url, context, doLoad);
    }

    return doLoad(url, context);
  }

  function doLoad(url, context) {
    if (RE_EXTS.test(new URL(url).pathname)) {
      const { format } = context;

      const filename = IS_WIN32 ? url : fileURLToPath(url);
      const source = fs.readFileSync(new URL(url), { encoding: 'utf8' });
      const { code } = transform(source, filename, url, format);

      return { format: 'module', source: code };
    }

    return originalDefaultLoad(url, context, originalDefaultLoad);
  }

  export function getFormat(url, context, defaultGetFormat) {
    if (RE_EXTS.test(new URL(url).pathname)) {
      return { format: 'module' };
    }

    return defaultGetFormat(url, context, defaultGetFormat);
  }

  export function transformSource(source, context, defaultTransformSource) {
    if (originalDefaultTransformSource === undefined) {
      originalDefaultTransformSource = defaultTransformSource;
    }

    const { url, format } = context;

    storeSourcePath(url)

    if (customHooks.onServerTransform !== undefined) {
      return customHooks.onServerTransform(url, context, doTransformSource);
    }

    return doTransformSource(source, context);
  }

  function doTransformSource(source, context) {
    const { url, format } = context;

    if (RE_EXTS.test(new URL(url).pathname)) {
      const filename = IS_WIN32 ? url : fileURLToPath(url);
      const { code } = transform(source, filename, url, format);

      return { source: code };
    }

    return originalDefaultTransformSource(source, context, originalDefaultTransformSource);
  }

  function transform(source, filename, url, format) {
    const {
      code,
      warnings,
    } = esbuild.transformSync(source.toString(), {
      sourcefile: filename,
      sourcemap: 'inline',
      loader: new URL(url).pathname.match(RE_EXTS)[1],
      target: 'node' + process.versions.node,
      format: 'esm',
    })

    if (warnings && warnings.length > 0) {
      for (const warning of warnings) {
        console.warn(warning.location);
        console.warn(warning.text);
      }
    }

    return { code };
  }

  function storeSourcePath(url) {
    if (url.startsWith('file:') && !url.includes('node_modules')) {
      global.sources.add(fileURLToPath(new URL(url)));
    }
  }
  `;
}
