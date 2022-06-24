import brokenNamedExportsPackages from './utils/broken-named-exports.js';
import fs from 'node:fs';
import { isMainThread } from 'node:worker_threads';
import mime from 'mime';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import rimraf from 'rimraf';
import send from 'send';

const DIR_NAME = '.dvlp';
const JS_MIME_TYPES = {
  'application/javascript': ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx'],
};
const TESTING = process.env.NODE_ENV === 'dvlptest' || process.env.CI != undefined;
// @ts-ignore - Replaced during build
const VERSION = global.$VERSION || '0.0.0';

const dirPath = path.resolve(DIR_NAME);
const subdirPath = path.join(dirPath, VERSION);
const applicationLoaderPath = pathToFileURL(path.join(subdirPath, 'app-loader.mjs'));
const bundleDirName = path.join(DIR_NAME, VERSION, 'bundled');
const bundleDirPath = path.resolve(bundleDirName);
const bundleDirMetaPath = path.join(bundleDirPath, '__meta__.json');
const defaultPort = process.env.PORT ? Number(process.env.PORT) : 8080;

mime.define(JS_MIME_TYPES, true);
// @ts-ignore
send.mime.define(JS_MIME_TYPES, true);

/**
 * Create directory structure:
 *  .dvlp/
 *    - <version>/
 *      - bundled/
 *      - app-loader.mjs
 *      - cache.json
 */
if (isMainThread) {
  const bundleDirExists = fs.existsSync(bundleDirPath);
  const dirExists = fs.existsSync(dirPath);
  const subdirExists = fs.existsSync(subdirPath);

  // New version of .dvlp, so delete existing
  if (dirExists && !subdirExists) {
    for (const item of fs.readdirSync(dirPath)) {
      rimraf.sync(path.resolve(dirPath, item));
    }
  }
  if (!bundleDirExists) {
    fs.mkdirSync(bundleDirPath, { recursive: true });
  }

  if (TESTING) {
    process.on('exit', () => {
      rimraf.sync(dirPath);
    });
  }
}

/**
 * @type { Config }
 */
const config = {
  activePort: defaultPort,
  applicationLoaderPath,
  brokenNamedExportsPackages,
  bundleDirPath,
  bundleDirMetaPath,
  bundleDirName,
  defaultPort,
  directories: [],
  dvlpDirPath: path.resolve(DIR_NAME),
  esbuildTargetByExtension: {
    '.js': 'js',
    '.mjs': 'js',
    '.cjs': 'js',
    '.json': 'json',
    '.jsx': 'jsx',
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.mts': 'ts',
    '.cts': 'ts',
  },
  // Ordered to trigger transpiling if necessary
  extensionsByType: {
    css: ['.pcss', '.sass', '.scss', '.less', '.styl', '.stylus', '.css'],
    html: ['.nunjs', '.nunjucks', '.hbs', '.handlebars', '.dust', '.html', '.htm'],
    js: ['.ts', '.mts', '.cts', '.tsx', '.jsx', '.mjs', '.cjs', '.js', '.json'],
  },
  latency: 50,
  maxAge: '10m',
  reloadEndpoint: '/dvlpreload',
  serverStartTimeout: TESTING ? 4000 : 10000,
  testing: TESTING,
  typesByExtension: {
    '.css': 'css',
    '.pcss': 'css',
    '.sass': 'css',
    '.scss': 'css',
    '.less': 'css',
    '.styl': 'css',
    '.stylus': 'css',
    '.html': 'html',
    '.htm': 'html',
    '.nunjs': 'html',
    '.nunjucks': 'html',
    '.hbs': 'html',
    '.handlebars': 'html',
    '.dust': 'html',
    '.js': 'js',
    '.mjs': 'js',
    '.cjs': 'js',
    '.json': 'js',
    '.jsx': 'js',
    '.ts': 'js',
    '.tsx': 'js',
    '.mts': 'js',
    '.cts': 'js',
  },
  version: VERSION,
};

export default config;
