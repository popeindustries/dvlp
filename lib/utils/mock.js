'use strict';

const config = require('../config');
const { error } = require('./log');
const fs = require('fs');
const { isJsonFilepath } = require('./is');
const path = require('path');
const { URL } = require('url');

let cache = new Map();

module.exports = {
  load,
  match
};

/**
 * Load files from 'dir'
 * @param {string} [dir]
 */
function load(dir = config.bundleDir) {
  cache = fs
    .readdirSync(dir)
    .filter(isJsonFilepath)
    .reduce((cache, filepath) => {
      try {
        const json = require(path.join(dir, filepath));
        const url = new URL(json.request.url || json.response.url);
        const key = `${url.hostname}/${url.pathname}`;

        if (!cache.has(key)) {
          cache.add(key, json);
        }
      } catch (err) {
        error(err);
      }
      return cache;
    }, cache);
}

function match(request) {}
