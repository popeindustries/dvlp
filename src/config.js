import brokenNamedExportsPackages from './utils/broken-named-exports.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR_NAME = '.dvlp';
const TESTING =
  process.env.NODE_ENV === 'dvlptest' || process.env.CI != undefined;
// @ts-ignore - Replaced during build
const VERSION = global.$VERSION || '0.0.0';

const dirPath = path.resolve(DIR_NAME);
const versionDirPath = path.join(dirPath, VERSION);
const applicationLoaderURL = pathToFileURL(
  path.join(versionDirPath, 'app-loader.mjs'),
);
const bundleDirName = path.join(DIR_NAME, VERSION, 'bundled');
const bundleDirPath = path.resolve(bundleDirName);
const bundleDirMetaPath = path.join(bundleDirPath, '__meta__.json');
const defaultPort = process.env.PORT ? Number(process.env.PORT) : 8080;
const electronEntryURL = pathToFileURL(
  path.join(versionDirPath, 'electron-entry.mjs'),
);

/**
 * @type { Config }
 */
const config = {
  activePort: defaultPort,
  applicationLoaderURL,
  brokenNamedExportsPackages,
  bundleDirPath,
  bundleDirMetaPath,
  bundleDirName,
  defaultPort,
  directories: [],
  dirPath,
  dvlpDirPath: path.resolve(DIR_NAME),
  electronEntryURL,
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
    html: [
      '.nunjs',
      '.nunjucks',
      '.hbs',
      '.handlebars',
      '.dust',
      '.html',
      '.htm',
    ],
    js: ['.ts', '.mts', '.cts', '.tsx', '.jsx', '.mjs', '.cjs', '.js', '.json'],
  },
  latency: 50,
  maxAge: '60',
  maxAgeLong: '3600',
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
  versionDirPath,
};

export default config;
