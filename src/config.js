import brokenNamedExportsPackages from './utils/broken-named-exports.js';
import fs from 'fs';
import { isMainThread } from 'worker_threads';
import mime from 'mime';
import path from 'path';
import rimraf from 'rimraf';
import send from 'send';

const DIR = '.dvlp';
const JS_MIME_TYPES = {
  'application/javascript': ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx'],
};
const TESTING = process.env.NODE_ENV === 'dvlptest' || process.env.CI != undefined;
// @ts-ignore - Replaced during build
const VERSION = global.$VERSION || 'dev';

const dir = path.resolve(DIR);
const applicationLoaderPath = path.join(dir, 'app-loader.mjs');
const sourceMapsDirName = `${path.join(DIR, `sourcemaps`)}`;
const sourceMapsDir = path.resolve(sourceMapsDirName);
const bundleDirName = `${path.join(DIR, `bundle-${VERSION}`)}`;
const bundleDir = path.resolve(bundleDirName);
const defaultPort = process.env.PORT ? Number(process.env.PORT) : 8080;

mime.define(JS_MIME_TYPES, true);
// @ts-ignore
send.mime.define(JS_MIME_TYPES, true);

/**
 * Create directory structure:
 *  .dvlp
 *    - bundle-xxx
 *    - sourcemaps
 */
if (isMainThread) {
  const sourceMapsDirExists = fs.existsSync(sourceMapsDir);
  const bundleDirExists = fs.existsSync(bundleDir);
  const dirExists = fs.existsSync(dir);

  if (dirExists && !bundleDirExists) {
    const contents = fs.readdirSync(dir).map((item) => path.resolve(dir, item));

    for (const item of contents) {
      // Delete all subdirectories
      if (fs.statSync(item).isDirectory()) {
        rimraf.sync(item);
      }
    }
  }
  if (sourceMapsDirExists) {
    rimraf.sync(sourceMapsDir);
  }
  if (!dirExists) {
    fs.mkdirSync(dir);
  }
  fs.mkdirSync(sourceMapsDir);
  if (!bundleDirExists) {
    fs.mkdirSync(bundleDir);
  } else {
    // Prune bundle dir of duplicates with different versions
    const moduleIds = new Map();

    for (const fileName of fs.readdirSync(bundleDir)) {
      if (fileName.endsWith('.js')) {
        // Remove version
        const moduleId = fileName.slice(0, fileName.lastIndexOf('-'));

        if (!moduleIds.has(moduleId)) {
          moduleIds.set(moduleId, path.join(bundleDir, fileName));
        } else {
          // Clear both instances if duplicates with different versions
          fs.unlinkSync(moduleIds.get(moduleId));
          fs.unlinkSync(path.join(bundleDir, fileName));
        }
      }
    }
  }

  if (TESTING) {
    process.on('exit', () => {
      rimraf.sync(dir);
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
  bundleDir,
  bundleDirName,
  defaultPort,
  directories: [],
  dvlpDir: path.resolve(DIR),
  esbuildTargetByExtension: {
    '.js': 'js',
    '.mjs': 'js',
    '.cjs': 'js',
    '.json': 'json',
    '.jsx': 'jsx',
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  // Ordered to trigger transpiling if necessary
  extensionsByType: {
    css: ['.pcss', '.sass', '.scss', '.less', '.styl', '.stylus', '.css'],
    html: ['.nunjs', '.nunjucks', '.hbs', '.handlebars', '.dust', '.html', '.htm'],
    js: ['.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.js', '.json'],
  },
  latency: 50,
  maxAge: '10m',
  reloadEndpoint: '/dvlpreload',
  serverStartTimeout: TESTING ? 4000 : 10000,
  sourceMapsDir,
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
  },
  version: VERSION,
};

export default config;
