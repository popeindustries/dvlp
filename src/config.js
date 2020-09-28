'use strict';

const brokenNamedExportsPackages = require('./utils/broken-named-exports.js');
const fs = require('fs');
const { isMainThread } = require('worker_threads');
const mime = require('mime');
const path = require('path');
const rimraf = require('rimraf');
const send = require('send');

const DIR = '.dvlp';
const JS_MIME_TYPES = {
  'application/javascript': ['js', 'jsx', 'ts', 'tsx'],
};
const TESTING =
  process.env.NODE_ENV === 'dvlptest' || process.env.CI != undefined;
// Replaced during build
const VERSION = global.$VERSION || 'dev';

const bundleDirName = `${path.join(DIR, `bundle-${VERSION}`)}`;
const bundleDir = path.resolve(bundleDirName);
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

mime.define(JS_MIME_TYPES, true);
send.mime.define(JS_MIME_TYPES, true);

// Guard against multiple workers performing the same file operations
if (isMainThread) {
  const dir = path.resolve(DIR);
  const bundleDirExists = fs.existsSync(bundleDir);
  const dirExists = fs.existsSync(dir);
  const rm = dirExists && !bundleDirExists;

  if (rm) {
    const contents = fs.readdirSync(dir).map((item) => path.resolve(dir, item));

    for (const item of contents) {
      // Delete all subdirectories
      if (fs.statSync(item).isDirectory()) {
        rimraf.sync(item);
      }
    }
  }
  if (!dirExists) {
    fs.mkdirSync(dir);
  }
  if (!bundleDirExists) {
    fs.mkdirSync(bundleDir);
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
module.exports = {
  applicationPort: port,
  brokenNamedExportsPackages,
  bundleDir,
  bundleDirName,
  directories: [],
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
    js: ['.ts', '.tsx', '.jsx', '.mjs', '.js', '.json'],
  },
  latency: 50,
  maxAge: '10m',
  port,
  reloadEndpoint: '/dvlpreload',
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
    '.json': 'js',
    '.jsx': 'js',
    '.ts': 'js',
    '.tsx': 'js',
  },
  version: VERSION,
};
