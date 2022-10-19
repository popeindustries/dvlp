import { error, info, noisyInfo } from '../utils/log.js';
import { fileURLToPath, pathToFileURL, URLSearchParams } from 'node:url';
import { getUrl, isEqualSearchParams } from '../utils/url.js';
import {
  isInvalidFilePath,
  isJsFilePath,
  isJsonFilePath,
} from '../utils/is.js';
import { match, pathToRegexp } from 'path-to-regexp';
import chalk from 'chalk';
import config from '../config.js';
import Debug from 'debug';
import fs from 'node:fs';
import { getProjectPath } from '../utils/file.js';
import { interceptClientRequest } from '../utils/intercept.js';
import { Metrics } from '../utils/metrics.js';
import mime from 'mime';
import path from 'node:path';
import send from 'send';

const RE_MAX_AGE = /max-age=(\d+)/;

const debug = Debug('dvlp:mock');
const mockClient =
  // @ts-ignore
  global.$MOCK_CLIENT ||
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'mock-client.js'),
    'utf8',
  );

export class Mock {
  /**
   * Constructor
   *
   * @param { string | Array<string> } [filePaths]
   */
  constructor(filePaths) {
    /** @type { Set<MockResponseData | MockStreamData> } */
    this.cache = new Set();
    this.client = mockClient;
    this.clear = this.clear.bind(this);
    this._uninterceptClientRequest;

    this.loaded =
      filePaths !== undefined ? this.load(filePaths) : Promise.resolve();
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
    const [url, originRegex, pathRegex, paramsMatch, searchParams] =
      getUrlSegmentsForMatching(req, ignoreSearch);
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
    const [url, originRegex, pathRegex, paramsMatch, searchParams] =
      getUrlSegmentsForMatching(stream, ignoreSearch);
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
  async load(filePaths) {
    if (!Array.isArray(filePaths)) {
      filePaths = [filePaths];
    }

    await Promise.all(filePaths.map((filePath) => this.loadFilePath(filePath)));

    const stringifiedCache = JSON.stringify(this.toJSON(), undefined, 2);

    // Client mocking only relevant for loaded mocks
    this.client = mockClient.replace(
      /cache\s?=\s?\[\]/,
      `cache=${stringifiedCache}`,
    );
  }

  /**
   * Match and handle mock response for 'key'
   * Will respond if 'res' passed
   *
   * @param { string } href
   * @param { Req } [req]
   * @param { Res } [res]
   * @returns { boolean | MockResponseData }
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

      mock.response(req, res);
      return true;
    }

    const {
      response: { hang, error, missing, offline },
    } = mock;

    // Handle special status
    if (hang) {
      return true;
    } else if (error || missing) {
      const statusCode = error ? 500 : 404;
      const body = error ? 'error' : 'missing';

      res.writeHead(statusCode);
      res.end(body);
      return true;
    } else if (offline && req) {
      req.socket.destroy();
      return true;
    }

    debug(`sending mocked "${href}"`);

    const {
      filePath,
      response: { body, headers = {}, status = 200 },
      type,
    } = mock;
    let content = body;

    switch (type) {
      case 'file': {
        // Set custom headers
        for (const header in headers) {
          res.setHeader(header, headers[header]);
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        send(
          {
            // @ts-ignore
            url: href,
            headers: {},
          },
          // @ts-ignore - body is path to file (relative to mock file)
          path.resolve(path.dirname(filePath), body),
          {
            dotfiles: 'allow',
            maxAge:
              getMaxAgeFromHeaders(
                normaliseHeaderKeys(headers, ['Cache-Control']),
              ) || config.maxAge,
          },
        ).pipe(res);
        return true;
      }
      case 'json': {
        content = JSON.stringify(body);
        break;
      }
    }

    // @ts-ignore
    res.writeHead(status, {
      // Allow Content-Type/Date to be overwritten
      'Content-Type': mime.getType(type),
      Date: new Date().toUTCString(),
      ...normaliseHeaderKeys(headers, ['Content-Type', 'Date']),
      // @ts-ignore
      'Content-Length': Buffer.byteLength(content),
      'Access-Control-Allow-Origin': '*',
    });
    // @ts-ignore
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
        `${chalk.green('    0ms')} triggered mocked push event ${chalk.green(
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
   * @deprecated - use clear()
   */
  clean() {
    this.clear();
  }

  /**
   * Clear all mock data
   */
  clear() {
    this.cache.clear();
    if (this._uninterceptClientRequest) {
      this._uninterceptClientRequest();
      this._uninterceptClientRequest = undefined;
    }
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

    // Iterate in reverse insertion order (newer first)
    for (const mock of Array.from(this.cache).reverse()) {
      if (
        !mock.originRegex.test(url.origin) ||
        // @ts-ignore
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
   * @param { string } filePath
   * @private
   */
  async loadFilePath(filePath) {
    filePath = path.resolve(filePath);

    try {
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        await this.loadDirectory(filePath);
      } else {
        await this.loadFile(filePath);
      }
    } catch (err) {
      error(`unable to find mock file ${filePath}`);
    }
  }

  /**
   * Load directory at 'dirpath'
   *
   * @param { string } dirpath
   * @private
   */
  async loadDirectory(dirpath) {
    await Promise.all(
      fs
        .readdirSync(dirpath)
        .map((filePath) => this.loadFilePath(path.join(dirpath, filePath))),
    );
  }

  /**
   * Load file at 'filePath'
   *
   * @param { string } filePath
   * @private
   */
  async loadFile(filePath) {
    try {
      /** @type { Array<MockResponseJSONSchema | MockPushEventJSONSchema> } */
      let mocks;

      if (isJsonFilePath(filePath)) {
        mocks = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else if (isJsFilePath(filePath)) {
        mocks = (await import(pathToFileURL(filePath).href)).default;
      } else {
        return;
      }

      let count = 0;
      let type = '';

      if (!Array.isArray(mocks)) {
        mocks = [mocks];
      }

      for (const mock of mocks) {
        if (!isMock(mock)) {
          return;
        } else if (!isValidMockFormat(mock)) {
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
      console.log(err);
      error(err);
    }
  }

  /**
   * Serialize cache content for transport
   *
   * @returns { Array<SerializedMock> }
   */
  toJSON() {
    return Array.from(this.cache).map((mockData) => {
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
    });
  }
}

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
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
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
 * @param { object } json
 * @returns { boolean }
 */
function isMock(json) {
  return (
    ('request' in json && 'response' in json) ||
    ('stream' in json && 'events' in json)
  );
}

/**
 * Validate that 'json' is correct format
 *
 * @param { { [key: string]: any } } mock
 * @returns { boolean }
 */
function isValidMockFormat(mock) {
  return (
    ('request' in mock &&
      'url' in mock.request &&
      'response' in mock &&
      'body' in mock.response) ||
    ('request' in mock &&
      'url' in mock.request &&
      'response' in mock &&
      typeof mock.response === 'function') ||
    ('stream' in mock && 'url' in mock.stream && 'events' in mock)
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

/**
 * Normalise the casing of select header keys
 *
 * @param { { [key: string]: string } } headers
 * @param { Array<string> } keys
 */
function normaliseHeaderKeys(headers, keys) {
  /** @type { { [key: string]: string } } */
  const normalisedHeaders = {};

  for (let key in headers) {
    const normalisedKey = key
      .split('-')
      .map((segment) => segment[0].toUpperCase() + segment.slice(1))
      .join('-');
    const value = headers[key];

    if (keys.includes(normalisedKey)) {
      key = normalisedKey;
    }

    normalisedHeaders[key] = value;
  }

  return normalisedHeaders;
}

/**
 * Retrieve max-age in ms from "headers" Cache-Control string
 *
 * @param { { [key: string]: string } } headers
 * @returns { number }
 */
function getMaxAgeFromHeaders(headers) {
  const cacheControl = headers['Cache-Control'];

  if (!cacheControl) {
    return 0;
  }

  const maxAge = RE_MAX_AGE.exec(cacheControl);

  return maxAge && maxAge[1] ? parseInt(maxAge[1], 10) * 1000 : 0;
}
