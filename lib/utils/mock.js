'use strict';

const chalk = require('chalk');
const debug = require('debug')('dvlp:mock');
const { error, info } = require('./log');
const { getProjectPath } = require('./file');
const fs = require('fs');
const { isJsonFilepath } = require('./is');
const mime = require('mime');
const path = require('path');
const send = require('send');
const { testing } = require('../config');
const { URL } = require('url');

let cache = new Map();

module.exports = {
  cleanMocks,
  load,
  match
};

if (testing) {
  module.exports.cache = cache;
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
  const url = new URL(typeof req === 'string' ? req : req.url, 'http://localhost');
  const key = getKey(url);
  const json = cache.get(key);

  if (!json || !matches(url, json)) {
    return false;
  }

  if (!res) {
    return json;
  }

  debug(`sending mocked "${getProjectPath(json.filepath)}"`);

  const body = json.response.body;
  const headers = json.response.headers || {};
  let content;

  // Body is path to file (relative to mock file)
  if (typeof body === 'string') {
    send(req, path.resolve(path.dirname(json.filepath), body), {
      cacheControl: false,
      dotfiles: 'allow'
    }).pipe(res);
  } else {
    content = JSON.stringify(json.response.body);
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'max-age=0',
      'Content-Type': mime.getType('json'),
      ...headers
    });
    res.end(content);
  }

  return true;
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
    const json = require(filepath);

    if (isValidSchema(json)) {
      const url = new URL(json.request.url, 'http://localhost');
      const key = getKey(url);

      json.url = url;
      json.ignoreSearch = json.request.ignoreSearch || false;
      json.filepath = filepath;

      if (!cache.has(key)) {
        cache.set(key, json);
        info(`${chalk.green('✔')} mocking request for ${chalk.green(json.request.url)}`);
      }
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
 * @param {object} json
 * @returns {boolean}
 */
function matches(url, json) {
  if (json.ignoreSearch) {
    return url.host === json.url.host && url.pathname === json.url.pathname;
  } else {
    return (
      url.host === json.url.host &&
      url.pathname === json.url.pathname &&
      url.search === json.url.search
    );
  }
}
