import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const t = String.raw;

/**
 * Create application loader based on passed hooks
 *
 * @param { import('url').URL } loaderPath
 * @param { { hooks?: Hooks, hooksPath?: string } } hooksConfig
 */
export function createApplicationLoader(loaderPath, hooksConfig) {
  const hooksPath =
    hooksConfig.hooks && (hooksConfig.hooks.onServerTransform || hooksConfig.hooks.onServerResolve)
      ? pathToFileURL(/** @type { string } */ (hooksConfig.hooksPath)).href
      : undefined;
  const contents = getLoaderContents(hooksPath);

  writeFileSync(loaderPath, contents);
}

/**
 * @param { string } [hooksPath]
 */
function getLoaderContents(hooksPath) {
  return t`
  import { fileURLToPath, pathToFileURL } from 'node:url';
  import { esbuild, nodeResolve } from 'dvlp';
  import { extname } from 'node:path';
  import fs from 'node:fs';
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
      const result = customHooks.onServerResolve(specifier, context, doResolve);
      result.shortCircuit = true;
      return result;
    }

    const r = doResolve(specifier, context)

    if ('then' in r) {
      return r.then((r) => {
        console.log(r);
        return r
      });
    } else {
      console.log(r)
      return r;
    }
  }

  function doResolve(specifier, context) {
    if (!specifier.startsWith('node:')) {
      const resolved = nodeResolve(specifier, context.parentURL ? fileURLToPath(context.parentURL) : undefined);
      if (resolved !== undefined) {
        resolved.shortCircuit = true;
        return resolved;
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
      const result = customHooks.onServerTransform(url, context, doLoad);
      result.shortCircuit = true;
      return result;
    }

    return doLoad(url, context);
  }

  function doLoad(url, context) {
    if (RE_EXTS.test(new URL(url).pathname)) {
      const { format } = context;

      const filename = IS_WIN32 ? url : fileURLToPath(url);
      const source = fs.readFileSync(new URL(url), { encoding: 'utf8' });
      const { code } = transform(source, filename, url, format);

      return { format: 'module', source: code, shortCircuit: true };
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
      return customHooks.onServerTransform(url, context, () => doTransformSource(source, context));
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
