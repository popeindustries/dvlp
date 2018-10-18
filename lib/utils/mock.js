'use strict';

const { error, info } = require('./log');
const { isInvalidFilepath, isJsonFilepath } = require('./is');
const chalk = require('chalk');
const config = require('../config');
const debug = require('debug')('dvlp:mock');
const { getProjectPath } = require('./file');
const fs = require('fs');
const { interceptClientRequest } = require('./intercept');
const mime = require('mime');
const path = require('path');
const send = require('send');
const stopwatch = require('./stopwatch');
const { URL } = require('url');

let cache = new Map();
let mocking = false;
let uninterceptClientRequest = () => {};

module.exports = {
  add,
  cleanMocks,
  hasMatch,
  load,
  match,
  remove
};

if (config.testing) {
  module.exports.cache = cache;
}

/**
 * Add new mock for 'res'
 * @param {string|object} req
 * @param {object} res
 * @param {boolean} once
 */
function add(req, res, once) {
  if (!res.body) {
    res = { body: res, headers: {} };
  }

  const url = getUrl(req);
  const key = getCacheKey(url);
  const ignoreSearch = req.ignoreSearch || false;
  const search = ignoreSearch || !url.search ? 'default' : url.search;
  const type =
    typeof res.body === 'string' ? (isInvalidFilepath(res.body) ? 'html' : 'file') : 'json';
  const filepath = req.filepath || path.join(process.cwd(), 'mock');
  // Allow multiple (subkeyed on search)
  const mock = cache.get(key) || {};

  mock[search] = {
    key: search,
    filepath,
    url,
    ignoreSearch,
    once,
    type,
    response: res
  };

  if (!mocking) {
    mocking = true;
    initRequestInterception();
  }
  cache.set(key, mock);
  debug(`adding mocked "${url.href}"`);
}

/**
 * Load mock files from disk
 * @param {string|[string]} filepaths
 */
function load(filepaths) {
  if (!Array.isArray(filepaths)) {
    filepaths = [filepaths];
  }

  for (let filepath of filepaths) {
    filepath = path.resolve(filepath);

    try {
      const stat = fs.statSync(filepath);

      if (stat.isDirectory()) {
        loadDirectory(filepath);
      } else {
        loadFile(filepath);
      }
    } catch (err) {
      error(`unable to find mock file ${filepath}`);
    }
  }
}

/**
 * Match and handle mock response for 'req'
 * @param {string|http.ClientRequest} req
 * @param {http.ServerResponse} [res]
 * @returns {boolean|object}
 */
function match(req, res) {
  const mock = getMock(req);

  if (!mock) {
    return false;
  }

  if (!res) {
    return mock;
  }

  if (mock.once) {
    remove(req);
  }

  debug(`sending mocked "${mock.url.href}"`);

  const {
    filepath,
    response: { body, headers = {} },
    type
  } = mock;
  let content = body;

  switch (type) {
    case 'file':
      // Body is path to file (relative to mock file)
      send({ url: req, headers: {} }, path.resolve(path.dirname(filepath), body), {
        cacheControl: false,
        dotfiles: 'allow'
      }).pipe(res);
      return;
    case 'json':
      content = JSON.stringify(body);
      break;
  }

  res.writeHead(200, {
    'Cache-Control': 'max-age=0',
    // Allow Cache-Control headers to be overwritten, but not Date
    ...headers,
    Date: new Date().toUTCString(),
    'Content-Length': Buffer.byteLength(content),
    'Content-Type': mime.getType(type)
  });
  res.end(content);

  info(
    `${stopwatch.stop(res.url, true, true)} handled mocked request for ${chalk.green(
      req.url ? req.url : req
    )}`
  );

  return true;
}

/**
 * Determine if 'url' matches 'mock'
 * If not defined, 'mock' will be retrieved from cache
 * @param {URL} url
 * @returns {boolean}
 */
function hasMatch(url) {
  return getMock(url) !== undefined;
}

/**
 * Remove existing mock
 * @param {string|http.ClientRequest} req
 */
function remove(req) {
  const { key } = getMock(req);
  const url = getUrl(req);
  const cacheKey = getCacheKey(url);
  const mock = cache.get(cacheKey);

  delete mock[key];

  if (!Object.keys(mock).length) {
    cache.delete(cacheKey);
    if (!cache.size) {
      mocking = false;
      uninterceptClientRequest();
    }
  }
}

/**
 * Clear all mocks
 */
function cleanMocks() {
  mocking = false;
  uninterceptClientRequest();
  cache.clear();
}

/**
 * Initialize request interception
 */
function initRequestInterception() {
  uninterceptClientRequest = interceptClientRequest((url) => {
    const mocked = hasMatch(url.href);

    if (mocked) {
      url.searchParams.append('mock', url.href);
      // Reroute to active server
      url.host = `localhost:${config.activePort}`;
    }
  });
}

/**
 * Retrieve mock
 * @param {string|http.ClientRequest} req
 * @returns {object}
 */
function getMock(req) {
  const url = getUrl(req);
  const key = getCacheKey(url);
  const mock = cache.get(key);

  if (!mock) {
    return;
  } else if (!url.search) {
    return mock.default;
  } else if (url.search in mock) {
    return mock[url.search];
  } else {
    if (mock.default && mock.default.ignoreSearch) {
      return mock.default;
    }
  }
}

/**
 * Load directory at 'dirpath'
 * @param {string} dirpath
 */
function loadDirectory(dirpath) {
  fs.readdirSync(dirpath).forEach((filepath) => {
    load(path.join(dirpath, filepath));
  });
}

/**
 * Load file at 'filepath'
 * @param {string} filepath
 */
function loadFile(filepath) {
  if (!isJsonFilepath(filepath)) {
    return;
  }

  try {
    let mocks = JSON.parse(fs.readFileSync(filepath, 'utf8'));

    if (!Array.isArray(mocks)) {
      mocks = [mocks];
    }

    for (const mock of mocks) {
      if (!isValidSchema(mock)) {
        return error(`invalid mock format for ${filepath}`);
      }

      const { request, response } = mock;

      request.filepath = filepath;
      add(request, response, false);
    }

    info(
      `${chalk.green('✔')} loaded ${mocks.length} mock response${
        mocks.length > 1 ? 's' : ''
      } from ${chalk.green(getProjectPath(filepath))}`
    );
  } catch (err) {
    error(err);
  }
}

/**
 * Validate that 'json' is correct format
 * @param {object} json
 * @returns {boolean}
 */
function isValidSchema(json) {
  return (
    'request' in json && 'response' in json && 'url' in json.request && 'body' in json.response
  );
}

/**
 * Retrieve URL instance from 'req'
 * @param {string|object|URL} req
 * @returns {URL}
 */
function getUrl(req) {
  if (req instanceof URL) {
    return req;
  }
  return new URL(typeof req === 'string' ? req : req.url, `http://localhost:${config.activePort}`);
}

/**
 * Retrieve key for 'url'
 * @param {URL} url
 * @returns {string}
 */
function getCacheKey(url) {
  return path.join(url.host, url.pathname);
}
