'use strict';

const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

const TESTING = process.env.NODE_ENV === 'test';
// Prevent parallel test runs from reading from same cache
const DIR = `.dvlp${TESTING ? process.getuid() : ''}`;

const childWatchEnv = process.env.CHILD_WATCHER;
const dir = path.resolve(DIR);
const bundleDirName = `${path.join(DIR, 'bundle')}`;
const bundleDir = path.resolve(bundleDirName);
const cacheDirName = `${path.join(DIR, 'cache')}`;
const cacheDir = path.resolve(cacheDirName);
const maxModuleBundlerWorkers = parseInt(process.env.BUNDLE_WORKERS, 10) || 0;
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
  for (const d of [bundleDir, cacheDir]) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d);
    }
  }
}

process.on('exit', () => {
  if (TESTING) {
    rimraf.sync(dir);
  }
});

module.exports = {
  bundleDir,
  bundleDirName,
  cacheDir,
  cacheDirName,
  childWatcher: !!(childWatchEnv && (childWatchEnv !== '0' || childWatchEnv !== 'false')),
  extensionsByType: {
    css: ['.css', '.sass', '.scss', '.less', '.styl', '.stylus'],
    html: ['.html', '.htm', '.nunjs', '.nunjucks', '.hbs', '.handlebars', '.dust'],
    js: ['.js', '.mjs', '.coffee', '.json', '.jsx', '.ts']
  },
  maxModuleBundlerWorkers,
  port,
  testing: TESTING,
  typesByExtension: {
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
    '.coffee': 'js',
    '.mjs': 'js',
    '.json': 'js',
    '.jsx': 'js',
    '.ts': 'js'
  }
};
