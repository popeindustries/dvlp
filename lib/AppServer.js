'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

/**
 * Create app server
 * @param {string} filepath
 * @param {string} [webroot]
 * @returns {Promise<{ destroy: () => void }>}
 */
module.exports = function appServer(filepath, webroot = process.cwd()) {
  return new Promise((resolve, reject) => {});
};
