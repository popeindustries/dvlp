'use strict';

/**
 * @typedef { import("http").ClientRequest } ClientRequest
 * @typedef { import("http").ServerResponse } ServerResponse
 * @typedef { import("../push-events/index.js").PushEvent } PushEvent
 * @typedef { import("../push-events/index.js").pushEvent } pushEvent
 * @typedef { import("../push-events/index.js").PushStream } PushStream
 */
/**
 * @typedef { object } MockRequest
 * @property { string } url
 * @property { string } filePath
 * @property { boolean } [ignoreSearch]
 */
/**
 * @typedef { object } MockResponse
 * @property { object } headers
 * @property { string | object } body
 */
/**
 * @typedef { object } MockPushStream
 * @property { string } url
 * @property { string } type
 * @property { string } filePath
 * @property { boolean } [ignoreSearch]
 */
/**
 * @typedef { object } MockPushEvent
 * @property { string } name
 * @property { string | object } [message]
 * @property { Array<MockPushEvent> } [sequence]
 * @property { object } [options]
 * @property { number } [options.delay]
 * @property { string } [options.event]
 * @property { string } [options.id]
 */

const { error, info } = require('../utils/log.js');
const { getUrl, getUrlCacheKey, isWebSocketUrl } = require('../utils/url.js');
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
        [...this.cache].map(([key, value]) => {
          const clientValue = {};

          for (const entry in value) {
            clientValue[entry] = {
              ignoreSearch: value[entry].ignoreSearch,
              url: value[entry].url.href
            };
            if (value[entry].events) {
              clientValue[entry].events = Object.keys(value[entry].events);
            }
          }

          return [key, clientValue];
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
  addResponse(req, res, once) {
    if (!res.body) {
      res = { body: res, headers: {} };
    }

    const url = getUrl(req);
    const key = getUrlCacheKey(url);
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
   * @param { string | MockPushStream } stream
   * @param { MockPushEvent | Array<MockPushEvent> } events
   */
  addPushEvents(stream, events) {
    if (!Array.isArray(events)) {
      events = [events];
    }
    const url = getUrl(stream);
    const key = getUrlCacheKey(url);
    const ignoreSearch = stream.ignoreSearch || false;
    const search = ignoreSearch || !url.search ? 'default' : url.search;
    const type = isWebSocketUrl(url) ? 'ws' : 'es';
    const filePath = stream.filePath || path.join(process.cwd(), 'mock');
    // Allow multiple (subkeyed on search)
    const mock = this.cache.get(key) || {};

    mock[search] = mock[search] || {
      key: search,
      filePath,
      url,
      ignoreSearch,
      type,
      events: {}
    };

    for (const event of events) {
      // Ignore events without a name
      if (event.name) {
        // Overwrite existing
        mock[search].events[event.name] = event;
      }
    }

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
   * Will respond if 'res' passed
   *
   * @param { string | ClientRequest } req
   * @param { ServerResponse } [res]
   * @returns { boolean | object | undefined }
   */
  matchResponse(req, res) {
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

  /**
   * Match and handle mock push event for 'stream'
   *
   * @param { string | MockPushStream } stream
   * @param { string } name
   * @param { (stream: string | PushStream, event: PushEvent) => void } [push]
   * @returns { boolean | object }
   */
  matchPushEvent(stream, name, push) {
    const mock = this.getMock(stream);

    if (!mock) {
      return false;
    }

    const event = mock.events[name];

    if (!event) {
      return false;
    }

    if (!push) {
      return event;
    }

    const { message, options, sequence } = event;

    triggerEventSequence(
      stream,
      sequence === undefined ? [{ message, options }] : sequence,
      push
    );

    return true;
  }

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
   * @param { string | ClientRequest | MockPushStream } reqOrStream
   */
  remove(reqOrStream) {
    const { key, url } = this.getMock(reqOrStream);
    const cacheKey = getUrlCacheKey(url);
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
   *
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
   * @param { string | ClientRequest | MockPushStream } reqOrStream
   * @returns { object }
   * @private
   */
  getMock(reqOrStream) {
    const url = getUrl(reqOrStream);
    const key = getUrlCacheKey(url);
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
      let count = 0;
      let type = '';

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
          this.addResponse(request, response, false);
          type = type === 'event' ? 'event/response' : 'response';
          count++;
        } else if (stream && events) {
          stream.filePath = filePath;
          this.addPushEvents(stream, events);
          type = type === 'response' ? 'event/response' : 'event';
          count += events.length;
        }
      }

      info(
        `${chalk.green('✔')} loaded ${count} mock ${type}${
          count > 1 ? 's' : ''
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
 * Match and handle mock push event for 'stream'
 *
 * @param { string | MockPushStream } stream
 * @param { Array<MockPushEvent> } sequence
 * @param { (stream: string | PushStream, event: PushEvent) => void } push
 * @returns { void }
 * @private
 */
async function triggerEventSequence(stream, sequence, push) {
  for (const event of sequence) {
    const { message, options: { delay = 0, ...options } = {} } = event;

    await sleep(delay);
    push(stream, { message, options });
  }
}

/**
 * Sleep for 'duration' milliseconds
 *
 * @param { number } duration
 * @returns { Promise<void> }
 * @private
 */
function sleep(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
