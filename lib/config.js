'use strict';

const path = require('path');

const testing = process.env.NODE_ENV === 'test';

// Prevent parallel test runs from reading from same cache
const moduleCacheDirName = `.dvlp${testing ? process.getuid() : ''}`;
const moduleCacheDir = path.resolve(moduleCacheDirName);
const maxModuleBundlerWorkers = parseInt(process.env.WORKERS, 10) || 0;

module.exports = {
  extensionsByType: {
    css: ['.css', '.sass', '.scss', '.less', '.styl', '.stylus'],
    html: ['.html', '.htm', '.nunjs', '.nunjucks', '.hbs', '.handlebars', '.dust'],
    js: ['.js', '.mjs', '.coffee', '.json', '.jsx', '.ts']
  },
  maxModuleBundlerWorkers,
  moduleCacheDirName,
  moduleCacheDir,
  port: process.env.PORT ? Number(process.env.PORT) : 8080,
  testing,
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
