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

const RE_REMOTE_URL = /^https?/;

let cache = new Map();
let mocking = false;

module.exports = {
  add,
  cleanMocks,
  load,
  match,
  remove
};

if (config.testing) {
  module.exports.cache = cache;
}

interceptClientRequest((url) => {
  if (!mocking) {
    return;
  }

  const mocked = match(url.href);

  if (mocked) {
    url.searchParams.append('mock', url.href);
    // Reroute to active server
    url.host = `localhost:${config.activePort}`;
  }
});

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
  const key = getKey(url);
  const ignoreSearch = req.ignoreSearch || false;
  const type =
    typeof res.body === 'string' ? (isInvalidFilepath(res.body) ? 'html' : 'file') : 'json';
  const filepath = req.filepath || path.join(process.cwd(), 'mock');
  const mock = {
    filepath,
    url,
    ignoreSearch,
    once,
    type,
    response: res
  };

  if (!cache.has(key)) {
    mocking = true;
    cache.set(key, mock);
  }
}

/**
 * Load mock files from disk
 * @param {string|[string]} filepaths
 * @param {string} [host]
 */
function load(filepaths, host) {
  if (!Array.isArray(filepaths)) {
    filepaths = [filepaths];
  }

  for (let filepath of filepaths) {
    filepath = path.resolve(filepath);

    try {
      const stat = fs.statSync(filepath);

      if (stat.isDirectory()) {
        loadDirectory(filepath, host);
      } else {
        loadFile(filepath, host);
      }
    } catch (err) {
      error(`unable to find mock file ${filepath}`);
    }
  }
}

/**
 * Match and handle mock response for 'req'
 * @param {http.ClientRequest} req
 * @param {http.ServerResponse} [res]
 * @returns {boolean|object}
 */
function match(req, res) {
  const url = getUrl(req);
  const key = getKey(url);
  const mock = cache.get(key);

  if (!mock || !matches(url, mock)) {
    return false;
  }

  if (!res) {
    return mock;
  }

  if (mock.once) {
    remove(req);
  }

  debug(`sending mocked "${getProjectPath(mock.filepath)}"`);

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

  info(`${stopwatch.stop(res.url, true, true)} handled mocked request for ${chalk.green(url)}`);

  return true;
}

/**
 * Remove existing mock
 * @param {string|object} req
 */
function remove(req) {
  const url = getUrl(req);
  const key = getKey(url);

  cache.delete(key);
  if (!cache.size) {
    mocking = false;
  }
}

/**
 * Clear all mocks
 */
function cleanMocks() {
  mocking = false;
  cache.clear();
}

/**
 * Load directory at 'dirpath'
 * @param {string} dirpath
 * @param {string} [host]
 */
function loadDirectory(dirpath, host) {
  fs.readdirSync(dirpath).forEach((filepath) => {
    load(path.join(dirpath, filepath), host);
  });
}

/**
 * Load file at 'filepath'
 * @param {string} filepath
 * @param {string} [host]
 */
function loadFile(filepath, host) {
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

      if (host && RE_REMOTE_URL.test(request.url)) {
        const url = new URL(request.url);
        const overrideUrl = new URL(host);

        url.host = overrideUrl.host;
        request.url = url.href;
      }

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
function getKey(url) {
  return path.join(url.host, url.pathname, url.search || '');
}

/**
 * Determine if 'url' matches mocked 'json'
 * @param {URL} url
 * @param {object} mock
 * @returns {boolean}
 */
function matches(url, mock) {
  const pathMatches = url.host === mock.url.host && url.pathname === mock.url.pathname;

  if (mock.ignoreSearch) {
    return pathMatches;
  }
  return pathMatches && url.search === mock.url.search;
}
