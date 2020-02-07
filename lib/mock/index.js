'use strict';

const { error, info, noisyInfo } = require('../utils/log.js');
const { getUrl, getUrlCacheKey, isWebSocketUrl } = require('../utils/url.js');
const { isInvalidFilePath, isJsonFilePath } = require('../utils/is.js');
const chalk = require('chalk');
const config = require('../config.js');
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
   * @implements { MockInstance }
   * @param { string | Array<string> } [filePaths]
   */
  constructor(filePaths) {
    /** @type { Map<string, MockCacheEntry> } */
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
          /** @type { { [key: string]: object }} */
          const clientValue = {};

          for (const entry in value) {
            clientValue[entry] = {
              ignoreSearch: value[entry].ignoreSearch,
              url: value[entry].url.href
            };
            // @ts-ignore
            if (value[entry].events) {
              // @ts-ignore
              clientValue[entry].events = Object.keys(value[entry].events);
            }
          }

          return [key, clientValue];
        })
      )
    );

    // Until tsc adds @implements support, assert that Mock is MockInstance.
    /** @type { MockInstance } */
    const mock = this; // eslint-disable-line no-unused-vars
  }

  /**
   * Add new mock for 'res'
   *
   * @param { string | MockRequest } req
   * @param { MockResponse } res
   * @param { boolean } [once]
   * @returns { void }
   */
  addResponse(req, res, once = false) {
    if (!res.body) {
      res = { body: res, headers: {} };
    }

    const url = getUrl(req);
    const key = getUrlCacheKey(url);
    const ignoreSearch = (isMockRequest(req) && req.ignoreSearch) || false;
    const search = ignoreSearch || !url.search ? 'default' : url.search;
    const type =
      typeof res.body === 'string'
        ? isInvalidFilePath(res.body)
          ? 'html'
          : 'file'
        : 'json';
    const filePath =
      (isMockRequest(req) && req.filePath) || path.join(process.cwd(), 'mock');
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
      this.enableRequestIntercept();
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
    const ignoreSearch =
      (isMockPushStream(stream) && stream.ignoreSearch) || false;
    const search = ignoreSearch || !url.search ? 'default' : url.search;
    const type = isWebSocketUrl(url) ? 'ws' : 'es';
    // Default to socket.io protocol for ws
    const protocol = (isMockPushStream(stream) && stream.protocol) || type;
    const filePath =
      (isMockPushStream(stream) && stream.filePath) ||
      path.join(process.cwd(), 'mock');
    // Allow multiple (subkeyed on search)
    const mock = this.cache.get(key) || {};
    /** @type { MockStreamData } */
    const mockData = (mock[search] = mock[search] || {
      key: search,
      filePath,
      url,
      ignoreSearch,
      type,
      protocol,
      events: {}
    });

    for (const event of events) {
      // Ignore events without a name
      if (event.name) {
        // Set options for ws
        if (type === 'ws') {
          const options = event.options || {};

          // @ts-ignore
          options.protocol = protocol;
          event.options = options;
        }
        // Overwrite existing
        // @ts-ignore
        mockData.events[event.name] = event;
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
   * Match and handle mock response for 'key'
   * Will respond if 'res' passed
   *
   * @param { string } key
   * @param { Req } [req]
   * @param { Res } [res]
   * @returns { false | object | undefined }
   */
  matchResponse(key, req, res) {
    const mock = this.getMock(key);

    if (!mock) {
      return false;
    }

    if (!req || !res) {
      return mock;
    }

    const {
      once,
      response: { hang, error, missing, offline }
    } = mock;

    if (once) {
      this.remove(key);
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
    } else if (offline && req) {
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
          // @ts-ignore
          { url: key, headers: {} },
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

    noisyInfo(
      `${stopwatch.stop(
        res.url,
        true,
        true
      )} handled mocked request for ${chalk.green(decodeURIComponent(req.url))}`
    );

    return true;
  }

  /**
   * Match and handle mock push event for 'stream'
   *
   * @param { string | MockPushStream } stream
   * @param { string } name
   * @param { (stream: string | PushStream, event: PushEvent) => void } push
   * @returns { boolean }
   */
  matchPushEvent(stream, name, push) {
    const mock = this.getMock(stream);
    /** @type { Array<MockPushEvent>} */
    let sequence;

    if (!mock) {
      return false;
    }

    const event = mock.events[name];

    if (name !== 'connect' || (name === 'connect' && event !== undefined)) {
      if (event === undefined) {
        return false;
      }

      sequence =
        event.sequence === undefined
          ? [{ message: event.message, options: event.options }]
          : event.sequence;
    } else {
      sequence = Object.keys(mock.events).reduce((
        /** @type { Array<MockPushEvent> } */
        sequence,
        name
      ) => {
        const event = mock.events[name];

        if (event.connect) {
          event.sequence === undefined
            ? sequence.push({
                name: event.name,
                message: event.message,
                options: event.options
              })
            : sequence.push(...event.sequence);
        }

        return sequence;
      }, []);

      if (sequence.length === 0) {
        return false;
      }
    }

    stopwatch.start(name);
    triggerEventSequence(stream, sequence, push).then(() => {
      noisyInfo(
        `${stopwatch.stop(
          name,
          true,
          true
        )} triggered mocked push event ${chalk.green(name)}`
      );
    });

    return true;
  }

  /**
   * Determine if 'url' matches cached mock
   *
   * @param { string | URL | Req | MockRequest | MockPushStream } keyOrObjectWithUrl
   * @returns { boolean }
   */
  hasMatch(keyOrObjectWithUrl) {
    return this.getMock(keyOrObjectWithUrl) !== undefined;
  }

  /**
   * Remove existing mock
   *
   * @param { string | Req | URL | MockRequest | MockPushStream } keyOrObjectWithUrl
   * @returns { void }
   */
  remove(keyOrObjectWithUrl) {
    const { key, url } = this.getMock(keyOrObjectWithUrl);
    const cacheKey = getUrlCacheKey(url);
    const mock = this.cache.get(cacheKey);

    if (mock) {
      delete mock[key];

      if (!Object.keys(mock).length) {
        this.cache.delete(cacheKey);
        if (!this.cache.size && this._uninterceptClientRequest) {
          this._uninterceptClientRequest();
          this._uninterceptClientRequest = undefined;
        }
      }
    }
  }

  /**
   * Clear all mocks
   *
   * @returns { void }
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
  enableRequestIntercept() {
    this._uninterceptClientRequest = interceptClientRequest((url) => {
      if (this.hasMatch(url.href)) {
        url.searchParams.append('dvlpmock', encodeURIComponent(url.href));
        // Reroute to active server
        url.host = `localhost:${config.activePort}`;
      }
      return true;
    });
  }

  /**
   * Retrieve mock
   *
   * @param { string | URL | Req | MockRequest | MockPushStream } keyOrObjectWithUrl
   * @returns { object }
   * @private
   */
  getMock(keyOrObjectWithUrl) {
    const url = getUrl(keyOrObjectWithUrl);
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
      /** @type { Array<MockResponseJSONSchema | MockPushEventJSONSchema> } */
      let mocks = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let count = 0;
      let type = '';

      if (!Array.isArray(mocks)) {
        mocks = [mocks];
      }

      for (const mock of mocks) {
        if (!isMockJSONSchema(mock)) {
          return;
        } else if (!isValidJSONSchema(mock)) {
          return error(`invalid mock format for ${filePath}`);
        }

        // @ts-ignore
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

/**
 * Match and handle mock push event for 'stream'
 *
 * @param { string | MockPushStream } stream
 * @param { Array<MockPushEvent> } sequence
 * @param { (stream: string | PushStream, event: PushEvent) => void } push
 * @returns { Promise<void> }
 * @private
 */
async function triggerEventSequence(stream, sequence, push) {
  for (const event of sequence) {
    const { message, options: { delay = 0, ...options } = {} } = event;

    await sleep(delay);
    // @ts-ignore
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

/**
 *
 * @param { object } json
 * @returns { boolean }
 */
function isMockJSONSchema(json) {
  return (
    ('request' in json && 'response' in json) ||
    ('stream' in json && 'events' in json)
  );
}

/**
 * Validate that 'json' is correct format
 *
 * @param { object } json
 * @returns { boolean }
 */
function isValidJSONSchema(json) {
  return (
    ('request' in json &&
      'url' in json.request &&
      'response' in json &&
      'body' in json.response) ||
    ('stream' in json && 'url' in json.stream && 'events' in json)
  );
}

/**
 * Determine if "req" is a MockRequest
 *
 * @param { unknown } req
 * @returns { req is MockRequest }
 */
function isMockRequest(req) {
  // @ts-ignore
  return req && typeof req === 'object' && req.url !== undefined;
}

/**
 * Determine if "req" is a MockPushStream
 *
 * @param { unknown } req
 * @returns { req is MockPushStream }
 */
function isMockPushStream(req) {
  // @ts-ignore
  return req && typeof req === 'object' && req.type !== undefined;
}
