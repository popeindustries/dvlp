'use strict';

const chalk = require('chalk');
const debug = require('debug')('dvlp:mock');
const { error, info } = require('./log');
const { getProjectPath } = require('./file');
const fs = require('fs');
const { isInvalidFilepath, isJsonFilepath } = require('./is');
const mime = require('mime');
const path = require('path');
const send = require('send');
const { testing } = require('../config');
const { URL } = require('url');

let cache = new Map();
let mocking = false;

module.exports = {
  add,
  cleanMocks,
  load,
  match,
  remove
};

if (testing) {
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

  mocking = true;

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
    cache.set(key, mock);
    info(`${chalk.green('✔')} mocking request for ${chalk.green(url.href)}`);
  }
}

/**
 * Load mock files
 * @param {string|[string]} filepath
 */
function load(filepath) {
  if (Array.isArray(filepath)) {
    return filepath.forEach(load);
  }

  filepath = path.resolve(filepath);

  try {
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) {
      loadDirectory(filepath);
    } else {
      loadFile(filepath);
    }

    mocking = true;
  } catch (err) {
    error(`unable to find mock file ${filepath}`);
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
  // TODO: log message

  const {
    filepath,
    response: { body, headers = {} },
    type
  } = mock;
  let content = body;

  switch (type) {
    case 'file':
      // Body is path to file (relative to mock file)
      send(req, path.resolve(path.dirname(filepath), body), {
        cacheControl: false,
        dotfiles: 'allow'
      }).pipe(res);
      return;
    case 'json':
      content = JSON.stringify(body);
      break;
  }

  res.writeHead(200, {
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'max-age=0',
    'Content-Type': mime.getType(type),
    ...headers
  });
  res.end(content);

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
  cache.clear();
}

/**
 * Load directory at 'dirpath'
 * @param {string} dirpath
 */
function loadDirectory(dirpath) {
  fs.readdirSync(dirpath).forEach((filepath) => {
    loadFile(path.join(dirpath, filepath));
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
    const mock = require(filepath);

    if (isValidSchema(mock)) {
      mock.request.filepath = filepath;
      add(mock.request, mock.response, false);
    } else {
      error(`invalid mock file format for ${filepath}`);
    }
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
  return new URL(typeof req === 'string' ? req : req.url, 'http://localhost');
}

/**
 * Retrieve key for 'url'
 * @param {URL} url
 * @returns {string}
 */
function getKey(url) {
  return path.join(url.host, url.pathname);
}

/**
 * Determine if 'url' matches mocked 'json'
 * @param {URL} url
 * @param {object} mock
 * @returns {boolean}
 */
function matches(url, mock) {
  if (mock.ignoreSearch) {
    return url.host === mock.url.host && url.pathname === mock.url.pathname;
  } else {
    return (
      url.host === mock.url.host &&
      url.pathname === mock.url.pathname &&
      url.search === mock.url.search
    );
  }
}
