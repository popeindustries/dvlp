'use strict';

const fs = require('fs');
const mime = require('mime');
const path = require('path');
const rimraf = require('rimraf');
const send = require('send');

const JS_MIME_TYPES = {
  'application/javascript': ['js', 'jsx', 'ts', 'tsx']
};
const TESTING = process.env.NODE_ENV === 'test';
// Prevent parallel test runs from reading from same cache
const DIR = `.dvlp${TESTING ? process.getuid() : ''}`;
const VERSION = process.env.DVLP_VERSION;

const bundleDirName = `${path.join(DIR, `bundle-${VERSION}`)}`;
const bundleDir = path.resolve(bundleDirName);
const maxModuleBundlerWorkers = parseInt(process.env.BUNDLE_WORKERS, 10) || 0;
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

mime.define(JS_MIME_TYPES, true);
send.mime.define(JS_MIME_TYPES, true);

const dir = path.resolve(DIR);

// Work around rollup-plugin-commonjs require.main.filename
if (TESTING || process.env.DVLP_LAUNCHER === 'cmd') {
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
 * @typedef { object } Config
 * @property { number } activePort,
 * @property { string } bundleDir,
 * @property { string } bundleDirName,
 * @property { Array<string> } directories,
 * @property { object } extensionsByType,
 * @property { Array<string> } extensionsByType.css,
 * @property { Array<string> } extensionsByType.html,
 * @property { Array<string> } extensionsByType.js,
 * @property { number } latency,
 * @property { string } maxAge,
 * @property { number } maxModuleBundlerWorkers,
 * @property { number } port,
 * @property { string } testing,
 * @property { object } typesByExtension,
 */
module.exports = {
  activePort: port,
  bundleDir,
  bundleDirName,
  directories: [],
  // Ordered to trigger transpiling if necessary
  extensionsByType: {
    css: ['.sass', '.scss', '.less', '.styl', '.stylus', '.css'],
    html: [
      '.nunjs',
      '.nunjucks',
      '.hbs',
      '.handlebars',
      '.dust',
      '.html',
      '.htm'
    ],
    js: ['.ts', '.tsx', '.mjs', '.jsx', '.js', '.json']
  },
  latency: 50,
  maxAge: '10m',
  maxModuleBundlerWorkers,
  port,
  rollupConfigPath: path.join(dir, 'rollup.config.js'),
  testing: TESTING,
  typesByExtension: {
    '.css': 'css',
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
    '.tsx': 'js'
  }
};
