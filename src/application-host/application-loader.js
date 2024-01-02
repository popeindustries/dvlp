// @ts-nocheck
/* global customHooks */

import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { nodeResolve } from 'dvlp/resolver';

const IS_WIN32 = process.platform === 'win32';
const RE_EXTS = /\.(tsx?|json)$/;

let port;

export function initialize(data = {}) {
  port = data.port;
}

export function resolve(specifier, context, nextResolve) {
  if (customHooks.onServerResolve !== undefined) {
    const resolved = customHooks.onServerResolve(
      specifier,
      context,
      (specifier, context) => doResolve(specifier, context, nextResolve),
    );
    resolved.shortCircuit = true;
    return resolved;
  }

  return doResolve(specifier, context, nextResolve);
}

function doResolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('node:')) {
    const resolved = nodeResolve(
      specifier,
      context.parentURL ? fileURLToPath(context.parentURL) : undefined,
    );
    if (resolved !== undefined) {
      resolved.shortCircuit = true;
      return resolved;
    }
  }

  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  port?.postMessage({
    type: 'dependency',
    filePath: url.startsWith('file://') ? fileURLToPath(url) : url,
  });

  if (customHooks.onServerTransform !== undefined) {
    const result = customHooks.onServerTransform(url, context, (url, context) =>
      doLoad(url, context, nextLoad),
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

function transform(source, filename, url, format) {
  const { code, warnings } = esbuild.transformSync(source.toString(), {
    sourcefile: filename,
    sourcemap: 'inline',
    loader: new URL(url).pathname.match(RE_EXTS)[1],
    target: 'node' + process.versions.node,
    format: 'esm',
  });

  if (warnings && warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(warning.location);
      console.warn(warning.text);
    }
  }

  return { code };
}
