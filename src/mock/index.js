'use strict';

const { error, info, noisyInfo } = require('../utils/log.js');
const { isInvalidFilePath, isJsonFilePath } = require('../utils/is.js');
const { match, pathToRegexp } = require('path-to-regexp');
const chalk = require('chalk');
const config = require('../config.js');
const debug = require('debug')('dvlp:mock');
const fs = require('fs');
const { getProjectPath } = require('../utils/file.js');
const { getUrl } = require('../utils/url.js');
const { interceptClientRequest } = require('../utils/intercept.js');
const Metrics = require('../utils/metrics.js');
const mime = require('mime');
const path = require('path');
const send = require('send');

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
    /** @type { Set<MockResponseData | MockStreamData> } */
    this.cache = new Set();
    this.clean = this.clean.bind(this);
    this.client = mockClient;
    this._uninterceptClientRequest;

    if (filePaths) {
      this.load(filePaths);
    }

    // Until tsc adds @implements support, assert that Mock is MockInstance.
    /** @type { MockInstance } */
    const mock = this; // eslint-disable-line no-unused-vars
  }

  /**
   * Add new mock for 'res'
   *
   * @param { string | MockRequest } req
   * @param { MockResponse | MockResponseHandler } res
   * @param { boolean } [once]
   * @param { () => void } [onMockCallback]
   * @returns { () => void } remove mock instance
   */
  addResponse(req, res, once = false, onMockCallback) {
    const ignoreSearch = (isMockRequest(req) && req.ignoreSearch) || false;
    const filePath =
      (isMockRequest(req) && req.filePath) || path.join(process.cwd(), 'mock');
    const [
      url,
      originRegex,
      pathRegex,
      paramsMatch,
      searchParams,
    ] = getUrlSegmentsForMatching(req, ignoreSearch);
    /** @type { MockResponseDataType } */
    let type = 'json';

    if (typeof res !== 'function') {
      if (!res.body) {
        res = { body: res, headers: {} };
      }
      if (typeof res.body === 'string') {
        type = isInvalidFilePath(res.body) ? 'html' : 'file';
      }
    }

    const mock = {
      url,
      originRegex,
      pathRegex,
      paramsMatch,
      searchParams,
      ignoreSearch,
      once,
      type,
      filePath,
      callback: onMockCallback,
      response: res,
    };

    if (!this._uninterceptClientRequest) {
      this.enableRequestIntercept();
    }
    this.cache.add(mock);
    debug(`adding mocked "${typeof req === 'string' ? req : req.url}"`);

    return () => {
      this.remove(mock);
    };
  }

  /**
   * Add new push mock for 'events'
   *
   * @param { string | MockPushStream } stream
   * @param { MockPushEvent | Array<MockPushEvent> } events
   * @returns { () => void } remove mock instance
   */
  addPushEvents(stream, events) {
    if (!Array.isArray(events)) {
      events = [events];
    }
    const ignoreSearch =
      (isMockPushStream(stream) && stream.ignoreSearch) || false;
    const filePath =
      (isMockPushStream(stream) && stream.filePath) ||
      path.join(process.cwd(), 'mock');
    const [
      url,
      originRegex,
      pathRegex,
      paramsMatch,
      searchParams,
    ] = getUrlSegmentsForMatching(stream, ignoreSearch);
    /** @type { MockStreamDataType } */
    const type = originRegex.source.includes('ws') ? 'ws' : 'es';
    // Default to socket.io protocol for ws
    const protocol = (isMockPushStream(stream) && stream.protocol) || type;
    /** @type { MockStreamData["events"] } */
    const eventsData = {};

    for (const event of events) {
      // Ignore events without a name
      if (event.name) {
        /** @type { MockStreamEventData["options"] } */
        const options = { delay: 0, ...event.options, protocol };

        /** @type { Array<MockStreamEventData> } */
        const sequence = [];

        if (event.sequence) {
          for (const sequenceEvent of event.sequence) {
            sequence.push({
              message: sequenceEvent.message || '',
              options: { delay: 0, ...sequenceEvent.options, protocol },
            });
          }
        } else {
          sequence.push({
            name: event.name,
            message: event.message || '',
            options,
          });
        }

        if (options.connect) {
          const connectEvent = eventsData.connect || [];

          connectEvent.push(...sequence);
          eventsData.connect = connectEvent;
        }

        eventsData[event.name] = sequence;
      }
    }

    /** @type { MockStreamData } */
    const mock = {
      url,
      originRegex,
      pathRegex,
      paramsMatch,
      searchParams,
      ignoreSearch,
      filePath,
      type,
      protocol,
      events: eventsData,
    };

    this.cache.add(mock);
    debug(
      `adding mocked stream "${
        typeof stream === 'string' ? stream : stream.url
      }"`,
    );

    return () => {
      this.remove(mock);
    };
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

    // Client mocking only relevant for loaded mocks
    this.client = mockClient.replace(
      /\$MOCKS/g,
      JSON.stringify(
        Array.from(this.cache).map((mockData) => {
          const data = {
            href: mockData.url.href,
            originRegex: mockData.originRegex.source,
            pathRegex: mockData.pathRegex.source,
            search: mockData.searchParams.toString(),
            ignoreSearch: mockData.ignoreSearch,
          };

          if (isMockStreamData(mockData)) {
            // @ts-ignore
            data.events = Object.keys(mockData.events);
          }

          return data;
        }),
        undefined,
        2,
      ),
    );
  }

  /**
   * Match and handle mock response for 'key'
   * Will respond if 'res' passed
   *
   * @param { string } href
   * @param { Req } [req]
   * @param { Res } [res]
   * @returns { boolean | MockResponseData | undefined }
   */
  matchResponse(href, req, res) {
    const mock = this.getMockData(href);

    if (!mock || !isMockResponseData(mock)) {
      return false;
    }

    if (!req || !res) {
      return mock;
    }

    res.metrics.recordEvent(Metrics.EVENT_NAMES.mock);
    res.mocked = true;

    if (mock.once) {
      this.remove(mock);
    }
    if (mock.callback) {
      process.nextTick(mock.callback);
    }
    if (typeof mock.response === 'function') {
      const url = getUrl(href);
      const matchObj = mock.paramsMatch(url.pathname);

      req.params = matchObj ? matchObj.params : {};

      return mock.response(req, res);
    }

    const {
      response: { hang, error, missing, offline },
    } = mock;

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

    debug(`sending mocked "${href}"`);

    const {
      filePath,
      response: { body, headers = {}, status = 200 },
      type,
    } = mock;
    let content = body;

    switch (type) {
      case 'file':
        res.setHeader('Access-Control-Allow-Origin', '*');
        // Body is path to file (relative to mock file)
        send(
          {
            // @ts-ignore
            url: href,
            headers: {},
          },
          // @ts-ignore
          path.resolve(path.dirname(filePath), body),
          {
            cacheControl: true,
            dotfiles: 'allow',
            maxAge: config.maxAge,
          },
        ).pipe(res);
        return;
      case 'json':
        content = JSON.stringify(body);
        break;
    }

    // @ts-ignore
    res.writeHead(status, {
      // Allow type to be overwritten
      'Content-Type': mime.getType(type),
      ...headers,
      // @ts-ignore
      'Content-Length': Buffer.byteLength(content),
      'Access-Control-Allow-Origin': '*',
      // Overwrite Date
      Date: new Date().toUTCString(),
    });
    res.end(content);
    res.metrics.recordEvent(Metrics.EVENT_NAMES.mock);

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
    const mock = this.getMockData(stream);

    if (!mock || !isMockStreamData(mock)) {
      return false;
    }

    const eventSequence = mock.events[name];

    if (!eventSequence) {
      return false;
    }

    triggerEventSequence(stream, eventSequence, push).then(() => {
      noisyInfo(
        `${chalk.green('     0ms')} triggered mocked push event ${chalk.green(
          name,
        )}`,
      );
    });

    return true;
  }

  /**
   * Determine if 'reqOrMockData' matches cached mock data
   *
   * @param { string | URL | { url: string } | MockResponseData | MockStreamData } reqOrMockData
   * @returns { boolean }
   */
  hasMatch(reqOrMockData) {
    if (isMockResponseData(reqOrMockData) || isMockStreamData(reqOrMockData)) {
      return this.cache.has(reqOrMockData);
    }
    return this.getMockData(reqOrMockData) !== undefined;
  }

  /**
   * Remove existing mock data
   *
   * @param { string | URL | { url: string } | MockResponseData | MockStreamData } reqOrMockData
   * @returns { void }
   */
  remove(reqOrMockData) {
    if (isMockResponseData(reqOrMockData) || isMockStreamData(reqOrMockData)) {
      this.cache.delete(reqOrMockData);
    } else {
      const mockData = this.getMockData(reqOrMockData);

      if (mockData) {
        this.cache.delete(mockData);
      }
    }

    if (this._uninterceptClientRequest && !this.cache.size) {
      this._uninterceptClientRequest();
      this._uninterceptClientRequest = undefined;
    }
  }

  /**
   * Clear all mock data
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
   * Retrieve mock response/stream data
   *
   * @param { string | URL | { url: string } } req
   * @returns { MockResponseData | MockStreamData | undefined }
   * @private
   */
  getMockData(req) {
    const url = getUrl(req);

    for (const mock of this.cache) {
      if (
        !mock.originRegex.test(url.origin) ||
        (!mock.ignoreSearch &&
          !isEqualSearchParams(url.searchParams, mock.searchParams))
      ) {
        continue;
      }

      if (mock.pathRegex.exec(url.pathname) != null) {
        return mock;
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
          stream.type = 'stream';
          this.addPushEvents(stream, events);
          type = type === 'response' ? 'event/response' : 'event';
          count += events.length;
        }
      }

      info(
        `${chalk.green('✔')} loaded ${count} mock ${type}${
          count > 1 ? 's' : ''
        } from ${chalk.green(getProjectPath(filePath))}`,
      );
    } catch (err) {
      error(err);
    }
  }
};

/**
 * Retrieve origin, path regex, and search params for "req"
 *
 * @param { string | MockRequest } req
 * @param { boolean } ignoreSearch
 * @returns { [URL, RegExp, RegExp, import('path-to-regexp').MatchFunction, URLSearchParams] }
 */
function getUrlSegmentsForMatching(req, ignoreSearch) {
  let href = typeof req === 'string' ? req : req.url;

  if (href.includes('127.0.0.1')) {
    href = href.replace('127.0.0.1', 'localhost');
  }

  const url = new URL(href, `http://localhost:${config.activePort}`);
  // Allow matching of both secure/unsecure protocols
  const origin = new RegExp(
    url.origin
      .replace(/http:|https:/, 'https?:')
      .replace('ws:', 'wss?:')
      .replace('//', '\\/\\/'),
  );
  let pathname = href.replace(origin, '');
  let search = '';

  if (pathname.includes('?')) {
    const isDynamic = /[:(]/.test(pathname);
    // Queries are escaped with '\\'
    // Strip all preceeding '\', no matter how many, because escaping is hard
    const regex = isDynamic ? /\\+\?(.*)$/ : /\?(.*)$/;
    const match = regex.exec(pathname);

    if (match) {
      search = match[1];
      pathname = pathname.replace(match[0], '');
    }
  }

  return [
    url,
    origin,
    pathToRegexp(pathname),
    match(pathname, { decode: decodeURIComponent }),
    new URLSearchParams(search),
  ];
}

/**
 * Determine if search params are equal
 *
 * @param { URLSearchParams } params1
 * @param { URLSearchParams } params2
 * @returns { boolean }
 */
function isEqualSearchParams(params1, params2) {
  // @ts-ignore
  const keys1 = Array.from(params1.keys());
  // @ts-ignore
  const keys2 = Array.from(params2.keys());

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    const values1 = params1.getAll(key);
    const values2 = params2.getAll(key);

    if (values1.length !== values2.length) {
      return false;
    }

    for (const value of values1) {
      if (!values2.includes(value)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Match and handle mock push event for 'stream'
 *
 * @param { string | MockPushStream } stream
 * @param { Array<MockStreamEventData> } eventSequence
 * @param { (stream: string | PushStream, event: PushEvent) => void } push
 * @returns { Promise<void> }
 * @private
 */
async function triggerEventSequence(stream, eventSequence, push) {
  for (const event of eventSequence) {
    const {
      message,
      options: { delay = 0, ...options },
    } = event;

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
 * @param { { [key: string]: any } } json
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
 * @param { any } req
 * @returns { req is MockRequest }
 */
function isMockRequest(req) {
  return (
    req &&
    typeof req === 'object' &&
    req.url !== undefined &&
    req.type === undefined
  );
}

/**
 * Determine if "req" is a MockPushStream
 *
 * @param { any } req
 * @returns { req is MockPushStream }
 */
function isMockPushStream(req) {
  return (
    req &&
    typeof req === 'object' &&
    req.url !== undefined &&
    req.type !== undefined
  );
}

/**
 * Determine if "mock" is a MockResponseData
 *
 * @param { any } mock
 * @returns { mock is MockResponseData }
 */
function isMockResponseData(mock) {
  return mock && typeof mock === 'object' && 'once' in mock;
}

/**
 * Determine if "mock" is a MockStreamData
 *
 * @param { any } mock
 * @returns { mock is MockStreamData }
 */
function isMockStreamData(mock) {
  return mock && typeof mock === 'object' && 'events' in mock;
}
