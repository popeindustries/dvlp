import { pathToFileURL } from 'url';
import { writeFileSync } from 'fs';

const t = String.raw;

/**
 * Create application loader based on passed hooks
 *
 * @param { string } loaderPath
 * @param { string } [hooksPath]
 */
export function createApplicationLoader(loaderPath, hooksPath) {
  if (hooksPath) {
    hooksPath = pathToFileURL(hooksPath).href;
  }
  const contents = getLoaderContents(hooksPath);
  writeFileSync(loaderPath, contents);
}

/**
 * @param { string } [hooksPath]
 */
function getLoaderContents(hooksPath) {
  return t`
  import { existsSync, readFileSync } from 'fs';
  import { fileURLToPath, pathToFileURL } from 'url';
  import { esbuild } from 'dvlp';
  import { extname } from 'path';
  ${hooksPath ? `import * as customHooks from '${hooksPath}';` : 'const customHooks = {};'}

  const BASE_URL = pathToFileURL(process.cwd() + '/').href;
  const IS_WIN32 = process.platform === 'win32';
  const RE_EXTS = /\.(tsx?|json)$/;
  const RE_IGNORE = /^[^.]/

  export function resolve(specifier, context, defaultResolve) {
    console.log(specifier, context)
    if (customHooks.onServerResolve !== undefined) {
      return customHooks.onServerResolve(specifier, context, defaultResolve);
    }

    const { parentURL = BASE_URL } = context;
    const url = new URL(specifier, parentURL);
    const { pathname } = url;

    if (RE_EXTS.test(specifier)) {
      return { url: url.href, format: 'module' };
    }
    // Resolve TS files missing extension
    if (!RE_IGNORE.test(specifier) && extname(pathname) === '') {
      for (const ext of ['.ts', '.tsx']) {
        url.pathname = pathname + ext;
        const path = fileURLToPath(url.href);
        if (existsSync(path)) {
          return { url: url.href, format: 'module' };
        }
      }
    }

    return defaultResolve(specifier, context, defaultResolve);
  }

  export function load(url, context, defaultLoad) {
    if (customHooks.onServerTransform !== undefined) {
      return customHooks.onServerTransform(specifier, context, defaultResolve);
    }

    if (RE_EXTS.test(new URL(url).pathname)) {
      const { format } = context;

      const filename = IS_WIN32 ? url : fileURLToPath(url);
      const source = readFileSync(new URL(url), { encoding: 'utf8' });
      const { code } = transform(source, filename, url, format);

      return { format: 'module', source: code };
    }

    return defaultLoad(url, context, defaultLoad);
  }

  export function getFormat(url, context, defaultGetFormat) {
    if (RE_EXTS.test(new URL(url).pathname)) {
      return { format: 'module' };
    }

    return defaultGetFormat(url, context, defaultGetFormat);
  }

  export function transformSource(source, context, defaultTransformSource) {
    const { url, format } = context;

    if (customHooks.onServerTransform !== undefined) {
      return customHooks.onServerTransform(url, context, () => {
        return defaultTransformSource(source, context, defaultTransformSource)
      });
    }

    if (RE_EXTS.test(new URL(url).pathname)) {
      const filename = IS_WIN32 ? url : fileURLToPath(url);
      const { code } = transform(source, filename, url, format);

      return { source: code };
    }

    return defaultTransformSource(source, context, defaultTransformSource);
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
  `;
}
