const t = String.raw;

/**
 * Generate esm-loader file contents
 *
 * @param { string } [hooksPath]
 */
export function getLoaderContents(hooksPath) {
  return t`
  import { fileURLToPath, pathToFileURL } from 'node:url';
  import { esbuild, nodeResolve } from 'dvlp';
  import { extname } from 'node:path';
  import fs from 'node:fs';
  ${
    hooksPath
      ? `import customHooks from '${hooksPath}';`
      : 'const customHooks = {};'
  }

  global.sources = new Set();

  const BASE_URL = pathToFileURL(process.cwd() + '/').href;
  const IS_WIN32 = process.platform === 'win32';
  const RE_EXTS = /\.(tsx?|json)$/;
  const RE_IGNORE = /^[^.]/
  let originalDefaultResolve;
  let originalDefaultLoad;
  let originalDefaultTransformSource;

  export function resolve(specifier, context, nextResolve) {
    if (customHooks.onServerResolve !== undefined) {
      const resolved = customHooks.onServerResolve(
        specifier,
        context,
        (specifier, context) => doResolve(specifier, context, nextResolve)
      );
      resolved.shortCircuit = true;
      return resolved;
    }

    return doResolve(specifier, context, nextResolve);
  }

  function doResolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('node:')) {
      const resolved = nodeResolve(specifier, context.parentURL ? fileURLToPath(context.parentURL) : undefined);
      if (resolved !== undefined) {
        resolved.shortCircuit = true;
        return resolved;
      }
    }

    return nextResolve(specifier, context);
  }

  export function load(url, context, nextLoad) {
    storeSourcePath(url);

    if (customHooks.onServerTransform !== undefined) {
      const result = customHooks.onServerTransform(
        url,
        context,
        (url, context) => doLoad(url, context, nextLoad)
      );
      result.shortCircuit = true;
      return result;
    }

    return doLoad(url, context, nextLoad);
  }

  function doLoad(url, context, nextLoad) {
    if (RE_EXTS.test(new URL(url).pathname)) {
      const { format } = context;

      const filename = IS_WIN32 ? url : fileURLToPath(url);
      const source = fs.readFileSync(new URL(url), { encoding: 'utf8' });
      const { code } = transform(source, filename, url, format);

      return { format: 'module', source: code, shortCircuit: true };
    }

    return nextLoad(url, context);
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
      return customHooks.onServerTransform(
        url,
        context,
        () => doTransformSource(source, context, defaultTransformSource)
      );
    }

    return doTransformSource(source, context, defaultTransformSource);
  }

  function doTransformSource(source, context, defaultTransformSource) {
    const { url, format } = context;

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
