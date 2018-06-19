'use strict';

const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

const TESTING = process.env.NODE_ENV === 'test';
// Prevent parallel test runs from reading from same cache
const DIR = `.dvlp${TESTING ? process.getuid() : ''}`;

const dir = path.resolve(DIR);
const bundleDirName = `${path.join(DIR, 'bundle')}`;
const bundleDir = path.resolve(bundleDirName);
const cacheDirName = `${path.join(DIR, 'cache')}`;
const cacheDir = path.resolve(cacheDirName);
const mockDirName = `${path.join(DIR, 'mock')}`;
const mockDir = path.resolve(mockDirName);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
  for (const d of [bundleDir, cacheDir, mockDir]) {
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
  extensionsByType: {
    css: ['.css', '.sass', '.scss', '.less', '.styl', '.stylus'],
    html: ['.html', '.htm', '.nunjs', '.nunjucks', '.hbs', '.handlebars', '.dust'],
    js: ['.js', '.mjs', '.coffee', '.json', '.jsx', '.ts']
  },
  maxModuleBundlerWorkers: parseInt(process.env.WORKERS, 10) || 0,
  mockDir,
  mockDirName,
  port: process.env.PORT ? Number(process.env.PORT) : 8080,
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
