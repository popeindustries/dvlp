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
  import { esbuild } from 'dvlp';
  import { extname } from 'path';
  import fs from 'fs';
  ${hooksPath ? `import customHooks from '${hooksPath}';` : 'const customHooks = {};'}

  global.sources = new Set();

  const BASE_URL = pathToFileURL(process.cwd() + '/').href;
  const IS_WIN32 = process.platform === 'win32';
  const RE_EXTS = /\.(tsx?|json)$/;
  const RE_IGNORE = /^[^.]/

  export function resolve(specifier, context, defaultResolve) {
    if (customHooks.onServerResolve !== undefined) {
      return customHooks.onServerResolve(specifier, context, defaultResolve);
    }

    const { parentURL = BASE_URL } = context;
    const url = new URL(specifier, parentURL);
    const { pathname } = url;
    const ext = extname(pathname);

    if (RE_EXTS.test(specifier)) {
      return { url: url.href, format: 'module' };
    }
    // Resolve relative TS files missing extension.
    // Test against supported extensions to handle pathnames with '.'
    if (!RE_IGNORE.test(specifier) && (ext === '' | !${JSON.stringify(jsExtensions)}.includes(ext))) {
      for (const ext of ['.ts', '.tsx']) {
        url.pathname = pathname + ext;
        const path = fileURLToPath(url.href);
        if (fs.existsSync(path)) {
          return { url: url.href, format: 'module' };
        }
      }
    }

    return defaultResolve(specifier, context, defaultResolve);
  }

  export function load(url, context, defaultLoad) {
    storeSourcePath(url);

    if (customHooks.onServerTransform !== undefined) {
      return customHooks.onServerTransform(url, context, defaultLoad);
    }

    if (RE_EXTS.test(new URL(url).pathname)) {
      const { format } = context;

      const filename = IS_WIN32 ? url : fileURLToPath(url);
      const source = fs.readFileSync(new URL(url), { encoding: 'utf8' });
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

    storeSourcePath(url)

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

  function storeSourcePath(url) {
    if (url.startsWith('file:') && !url.includes('node_modules')) {
      global.sources.add(fileURLToPath(new URL(url)));
    }
  }
  `;
}
