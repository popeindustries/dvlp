'use strict';

const fs = require('fs');
const mime = require('mime');
const path = require('path');
const rimraf = require('rimraf');
const send = require('send');

const JS_MIME_TYPES = {
  'application/javascript': ['js', 'jsx', 'ts', 'tsx'],
};
const TESTING =
  process.env.NODE_ENV === 'dvlptest' || process.env.CI != undefined;
// Prevent parallel test runs from reading from same cache
const DIR = `.dvlp${TESTING ? process.getuid() : ''}`;

// @ts-ignore
const VERSION = global.$VERSION || 'dev';

const bundleDirName = `${path.join(DIR, `bundle-${VERSION}`)}`;
const bundleDir = path.resolve(bundleDirName);
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

mime.define(JS_MIME_TYPES, true);
send.mime.define(JS_MIME_TYPES, true);

const dir = path.resolve(DIR);

// Work around @rollup/plugin-commonjs require.main.filename
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
 * @type { Config }
 */
module.exports = {
  activePort: port,
  brokenNamedExportsPackages: {
    react: [
      'Children',
      'Component',
      'Fragment',
      'Profiler',
      'PureComponent',
      'StrictMode',
      'Suspense',
      '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
      'cloneElement',
      'createContext',
      'createElement',
      'createFactory',
      'createRef',
      'forwardRef',
      'isValidElement',
      'lazy',
      'memo',
      'useCallback',
      'useContext',
      'useDebugValue',
      'useEffect',
      'useImperativeHandle',
      'useLayoutEffect',
      'useMemo',
      'useReducer',
      'useRef',
      'useState',
      'version',
    ],
    'react-dom': [
      '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
      'createPortal',
      'findDOMNode',
      'flushSync',
      'hydrate',
      'render',
      'unmountComponentAtNode',
      'unstable_batchedUpdates',
      'unstable_createPortal',
      'unstable_renderSubtreeIntoContainer',
      'version',
    ],
    'react-is': ['isContextConsumer', 'isValidElementType'],
  },
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
      '.htm',
    ],
    // Sync with utils/module.js
    js: ['.ts', '.tsx', '.mjs', '.jsx', '.js', '.json'],
  },
  latency: 50,
  maxAge: '10m',
  port,
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
    '.tsx': 'js',
  },
};
