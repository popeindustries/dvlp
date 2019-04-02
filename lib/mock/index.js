'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 * @typedef { import("http").ServerResponse } ServerResponse
 */
/**
 * @typedef { object } MockRequest
 * @property { string } url
 * @property { boolean } ignoreSearch
 * @property { string } filePath
 */
/**
 * @typedef { object } MockResponse
 * @property { object } headers
 * @property { string | object } body
 */
/**
 * @typedef { object } MockStream
 * @property { string } url
 * @property { boolean } ignoreSearch
 * @property { string } filePath
 * @property { string } type
 */
/**
 * @typedef { object } MockEvent
 * @property { string } name
 * @property { string | object } [message]
 * @property { Array<MockEvent> } [sequence]
 * @property { object } [options]
 * @property { number } [options.delay]
 * @property { string } [options.event]
 * @property { string } [options.id]
 */

const { error, info } = require('../utils/log.js');
const { isInvalidFilePath, isJsonFilePath } = require('../utils/is.js');
const chalk = require('chalk');
const config = require('../config.js');
const crypto = require('crypto');
const debug = require('debug')('dvlp:mock');
const { getProjectPath } = require('../utils/file.js');
const fs = require('fs');
const { interceptClientRequest } = require('../utils/intercept.js');
const mime = require('mime');
const path = require('path');
const send = require('send');
const stopwatch = require('../utils/stopwatch.js');
const { URL } = require('url');

const RE_WEB_SOCKET = /wss?:/;

const mockClient =
  global.$MOCK_CLIENT ||
  fs.readFileSync(path.resolve(__dirname, 'mock-client.js'), 'utf8');

module.exports = class Mock {
  /**
   * Constructor
   *
   * @param { string | Array<string> } [filePaths]
   */
  constructor(filePaths) {
    this.cache = new Map();
    this.clean = this.clean.bind(this);
    this._uninterceptClientRequest;

    if (filePaths) {
      this.load(filePaths);
    }

    // Client mocking only relevant for loaded mocks,
    // so safe to serialize after call to this.load()
    this.client = mockClient.replace(
      /\$MOCKS/g,
      JSON.stringify(
        [...this.cache].map((item) => {
          const value = {};

          for (const entry in item[1]) {
            value[entry] = { ignoreSearch: item[1][entry].ignoreSearch };
          }

          return [item[0], value];
        })
      )
    );
    this.clientHash = crypto
      .createHash('sha256')
      .update(this.client)
      .digest('base64');
  }

  /**
   * Add new mock for 'res'
   *
   * @param { string | MockRequest } req
   * @param { MockResponse } res
   * @param { boolean } once
   */
  add(req, res, once) {
    if (!res.body) {
      res = { body: res, headers: {} };
    }

    const url = getUrl(req);
    const key = getCacheKey(url);
    const ignoreSearch = req.ignoreSearch || false;
    const search = ignoreSearch || !url.search ? 'default' : url.search;
    const type =
      typeof res.body === 'string'
        ? isInvalidFilePath(res.body)
          ? 'html'
          : 'file'
        : 'json';
    const filePath = req.filePath || path.join(process.cwd(), 'mock');
    // Allow multiple (subkeyed on search)
    const mock = this.cache.get(key) || {};

    mock[search] = {
      key: search,
      filePath,
      url,
      ignoreSearch,
      once,
      type,
      response: res
    };

    if (!this._uninterceptClientRequest) {
      this._initRequestInterception();
    }
    this.cache.set(key, mock);
    debug(`adding mocked "${url.href}"`);
  }

  /**
   * Add new push mock for 'events'
   *
   * @param { string | MockStream } stream
   * @param { Array<MockEvent> } events
   */
  addEvent(stream, events) {
    const url = getUrl(stream);
    const key = getCacheKey(url);
    const ignoreSearch = stream.ignoreSearch || false;
    const search = ignoreSearch || !url.search ? 'default' : url.search;
    const type = RE_WEB_SOCKET.test(url.protocol) ? 'ws' : 'es';
    const filePath = stream.filePath || path.join(process.cwd(), 'mock');
    // Allow multiple (subkeyed on search)
    const mock = this.cache.get(key) || {};

    mock[search] = {
      key: search,
      filePath,
      url,
      ignoreSearch,
      type,
      events
    };

    this.cache.set(key, mock);
    debug(`adding mocked stream "${url.href}"`);
  }

  /**
   * Load mock files from disk
   *
   * @param { string | Array<string> } filePaths
   */
  load(filePaths) {
    if (!Array.isArray(filePaths)) {
      filePaths = [filePaths];
    }

    for (let filePath of filePaths) {
      filePath = path.resolve(filePath);

      try {
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          this.loadDirectory(filePath);
        } else {
          this.loadFile(filePath);
        }
      } catch (err) {
        error(`unable to find mock file ${filePath}`);
      }
    }
  }

  /**
   * Match and handle mock response for 'req'
   *
   * @param { string | ClientRequest } req
   * @param { ServerResponse } [res]
   * @returns { boolean | object }
   */
  match(req, res) {
    const mock = this.getMock(req);

    if (!mock) {
      return false;
    }

    if (!res) {
      return mock;
    }

    const {
      once,
      response: { hang, error, missing, offline }
    } = mock;

    if (once) {
      this.remove(req);
    }

    // Handle special status
    if (hang) {
      return;
    } else if (error || missing) {
      const statusCode = error ? 500 : 404;
      const body = error ? 'error' : 'missing';

      res.writeHead(statusCode);
      res.end(body);
      return;
    } else if (offline) {
      req.socket.destroy();
      return;
    }

    debug(`sending mocked "${mock.url.href}"`);

    const {
      filePath,
      response: { body, headers = {} },
      type
    } = mock;
    let content = body;

    switch (type) {
      case 'file':
        // Body is path to file (relative to mock file)
        send(
          { url: req, headers: {} },
          path.resolve(path.dirname(filePath), body),
          {
            cacheControl: true,
            dotfiles: 'allow',
            maxAge: config.maxAge
          }
        ).pipe(res);
        return;
      case 'json':
        content = JSON.stringify(body);
        break;
    }

    res.writeHead(200, {
      // Allow type to be overwritten
      'Content-Type': mime.getType(type),
      ...headers,
      'Content-Length': Buffer.byteLength(content),
      // Overwrite Date
      Date: new Date().toUTCString()
    });
    res.end(content);

    info(
      `${stopwatch.stop(
        res.url,
        true,
        true
      )} handled mocked request for ${chalk.green(
        decodeURIComponent(req.url ? req.url : req)
      )}`
    );

    return true;
  }

  // matchEvent(stream) {}

  /**
   * Determine if 'url' matches cached mock
   *
   * @param { URL } url
   * @returns { boolean }
   */
  hasMatch(url) {
    return this.getMock(url) !== undefined;
  }

  /**
   * Remove existing mock
   *
   * @param { string | ClientRequest } reqOrStream
   */
  remove(reqOrStream) {
    const { key } = this.getMock(reqOrStream);
    const url = getUrl(reqOrStream);
    const cacheKey = getCacheKey(url);
    const mock = this.cache.get(cacheKey);

    delete mock[key];

    if (!Object.keys(mock).length) {
      this.cache.delete(cacheKey);
      if (!this.cache.size && this._uninterceptClientRequest) {
        this._uninterceptClientRequest();
      }
    }
  }

  /**
   * Clear all mocks
   */
  clean() {
    this.cache.clear();
    this._uninterceptClientRequest && this._uninterceptClientRequest();
  }

  /**
   * Initialize request interception
   * @private
   */
  _initRequestInterception() {
    this._uninterceptClientRequest = interceptClientRequest((url) => {
      if (this.hasMatch(url.href)) {
        url.searchParams.append('dvlpmock', encodeURIComponent(url.href));
        // Reroute to active server
        url.host = `localhost:${config.activePort}`;
      }
    });
  }

  /**
   * Retrieve mock
   *
   * @param { string | ClientRequest } req
   * @returns { object }
   * @private
   */
  getMock(req) {
    const url = getUrl(req);
    const key = getCacheKey(url);
    const mock = this.cache.get(key);

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
   *
   * @param { string } dirpath
   * @private
   */
  loadDirectory(dirpath) {
    fs.readdirSync(dirpath).forEach((filePath) => {
      this.load(path.join(dirpath, filePath));
    });
  }

  /**
   * Load file at 'filePath'
   *
   * @param { string } filePath
   * @private
   */
  loadFile(filePath) {
    if (!isJsonFilePath(filePath)) {
      return;
    }

    try {
      let mocks = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (!Array.isArray(mocks)) {
        mocks = [mocks];
      }

      for (const mock of mocks) {
        if (!isMockFile(mock)) {
          return;
        } else if (!isValidSchema(mock)) {
          return error(`invalid mock format for ${filePath}`);
        }

        const { request, response, stream, events } = mock;

        if (request && response) {
          request.filePath = filePath;
          this.add(request, response, false);
        } else if (stream && events) {
          stream.filePath = filePath;
          this.addEvent(stream, events);
        }
      }

      info(
        `${chalk.green('✔')} loaded ${mocks.length} mock response${
          mocks.length > 1 ? 's' : ''
        } from ${chalk.green(getProjectPath(filePath))}`
      );
    } catch (err) {
      error(err);
    }
  }
};

function isMockFile(json) {
  return 'request' in json || 'response' in json || 'stream' in json;
}

/**
 * Validate that 'json' is correct format
 *
 * @param { object } json
 * @returns { boolean }
 * @private
 */
function isValidSchema(json) {
  return (
    ('request' in json &&
      'url' in json.request &&
      'response' in json &&
      'body' in json.response) ||
    ('stream' in json && 'url' in json.stream && 'events' in json)
  );
}

/**
 * Retrieve URL instance from 'req'
 *
 * @param { string | MockRequest | ClientRequest | URL } req
 * @returns { URL }
 * @private
 */
function getUrl(req) {
  if (!(req instanceof URL)) {
    req = new URL(
      typeof req === 'string' ? decodeURIComponent(req) : req.url,
      `http://localhost:${config.activePort}`
    );
  }
  // Map loopback address to localhost
  if (req.hostname === '127.0.0.1') {
    req.hostname = 'localhost';
  }

  return req;
}

/**
 * Retrieve key for 'url'
 *
 * @param { URL } url
 * @returns { string }
 * @private
 */
function getCacheKey(url) {
  // Map loopback address to localhost
  const host = url.host === '127.0.0.1' ? 'localhost' : url.host;
  let key = path.join(host, url.pathname);

  return key;
}
