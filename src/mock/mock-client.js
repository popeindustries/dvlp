// @ts-nocheck - browser code
(function () {
  if (window.dvlp) {
    return;
  }

  const RE_WEB_SOCKET_PROTOCOL = /wss?:/;

  const originalXMLHttpRequestOpen = window.XMLHttpRequest.prototype.open;
  const originalFetch = window.fetch;
  // Note: empty array replaced in mock/index.js#load
  /** @type {Array<MockResponseData | MockStreamData>} */
  const cache = [].map(function (mockData) {
    mockData.originRegex = new RegExp(mockData.originRegex);
    mockData.pathRegex = new RegExp(mockData.pathRegex);
    return mockData;
  });
  const events = cache.reduce(function (events, mockData) {
    if (mockData.events) {
      events[mockData.href] = mockData.events;
    }
    return events;
  }, {});
  /** @type {Map<string, MockStream>} */
  const streams = new Map();
  let connectionCount = 0;
  let networkDisabled = false;

  window.XMLHttpRequest.prototype.open = function open(method, href) {
    const hrefAndMock = matchHref(href);
    href = hrefAndMock[0];
    const mockData = hrefAndMock[1];

    if (mockData) {
      // Handle mock registered in browser
      if (mockData.response) {
        // eslint-disable-next-line
        const xhr = this;
        const mockResponse = resolveMockResponse(mockData);
        // Delay responding by "delay" ms (ignored for handler responses)
        const delay =
          (typeof mockData.response !== 'function' &&
            mockData.response.delay) ||
          0;

        xhr.send = function send() {
          // Hang
          if (mockResponse.status === 0) {
            return;
          }

          const respond = function respond() {
            const body =
              typeof mockResponse.body === 'string'
                ? mockResponse.body
                : JSON.stringify(mockResponse.body);

            Object.defineProperties(xhr, {
              readyState: {
                value: 4,
              },
              response: {
                get: function () {
                  if (mockData.callback) {
                    setTimeout(mockData.callback, 0);
                  }
                  return body;
                },
              },
              responseText: {
                get: function () {
                  return this.response;
                },
              },
              responseURL: {
                value: href,
              },
              status: {
                get: function () {
                  return mockResponse.status;
                },
              },
            });

            console.log(
              'mocking xhr response (with local data) for: ' +
                parseOriginalHref(href),
            );
            if (
              xhr.onreadystatechange &&
              typeof xhr.onreadystatechange === 'function'
            ) {
              xhr.onreadystatechange({ currentTarget: xhr });
            }
            xhr.onload({ currentTarget: xhr });
          };

          if (delay > 0) {
            setTimeout(respond, delay);
          } else {
            respond();
          }
        };
      } else if (mockData.callback) {
        // Triggered on load/error/abort
        this.addEventListener('loadend', function () {
          mockData.callback();
        });
      }

      if (mockData.calls) {
        // eslint-disable-next-line
        const xhr = this;
        const requestHeaders = {};
        const originalSetRequestHeader = xhr.setRequestHeader;
        // Either the mocked "send" registered above, or the real one
        const innerSend = xhr.send;

        xhr.setRequestHeader = function setRequestHeader(name, value) {
          requestHeaders[String(name).toLowerCase()] = value;
          return originalSetRequestHeader.call(this, name, value);
        };
        xhr.send = function send(body) {
          recordCall(mockData, href, method, requestHeaders, body);
          return innerSend.call(this, body);
        };
      }
    }

    return originalXMLHttpRequestOpen.call(this, method, href);
  };

  if (typeof Proxy !== 'undefined') {
    if (typeof fetch !== 'undefined') {
      window.fetch = new Proxy(window.fetch, {
        apply(target, ctx, args) {
          const request = args[0];
          const options = args[1] || {};
          const [href, mockData] = matchHref(request);

          args[0] = href;

          if (mockData) {
            if (mockData.calls) {
              recordFetchCall(mockData, href, request, options);
            }

            // Handle mock registered in browser
            if (mockData.response) {
              const mockResponse = resolveMockResponse(mockData, options);

              // Hang
              if (mockResponse.status === 0) {
                return new Promise(
                  function () {},
                  function () {},
                );
              }

              const body =
                typeof mockResponse.body === 'string'
                  ? mockResponse.body
                  : JSON.stringify(mockResponse.body);
              const res = new Response(body, {
                headers: mockResponse.headers,
                status: mockResponse.status,
              });

              if (mockData.callback) {
                setTimeout(mockData.callback, 0);
              }

              console.log(
                'mocking fetch response (with local data) for: ' +
                  parseOriginalHref(href),
              );

              // Delay responding by "delay" ms (ignored for handler responses)
              const delay =
                (typeof mockData.response !== 'function' &&
                  mockData.response.delay) ||
                0;

              if (delay > 0) {
                return sleep(delay).then(function () {
                  return res;
                });
              }

              return Promise.resolve(res);
            } else if (mockData.callback) {
              return Reflect.apply(target, ctx, args)
                .then((response) => {
                  setTimeout(mockData.callback, 0);
                  return response;
                })
                .catch((err) => {
                  setTimeout(mockData.callback, 0);
                  throw err;
                });
            }
          }

          return Reflect.apply(target, ctx, args);
        },
      });
    }

    if (typeof EventSource !== 'undefined') {
      window.EventSource = new Proxy(window.EventSource, {
        construct: function (target, args) {
          const url = getUrl(args[0]);
          const [href, mockData] = matchHref(args[0]);
          const isLocal = mockData && mockData.handlers !== undefined;

          if (mockData) {
            console.log(
              `mocking EventSource response (with ${isLocal ? 'local' : 'remote'} data) for: ` +
                args[0],
            );
          }

          args[0] = href;

          const es = Reflect.construct(target, args);

          if (isLocal) {
            const connection = connectStream('es', url, [], es);

            if (connection) {
              const originalClose = es.close;

              es.close = function close() {
                connection._onClose();
                return originalClose.call(this);
              };
              es.addEventListener = new Proxy(es.addEventListener, {
                apply(target, ctx, args) {
                  const [event, callback] = args;

                  if (event !== 'open' && event !== 'error') {
                    mockData.handlers[event] = callback;
                    connection.handlers[event] = callback;
                  }

                  return Reflect.apply(target, ctx, args);
                },
              });
              defineHandlersOnMessage(mockData.handlers, es);
              defineHandlersOnMessage(connection.handlers, es);
            }
          }

          return es;
        },
      });
    }

    if (typeof WebSocket !== 'undefined') {
      window.WebSocket = new Proxy(window.WebSocket, {
        construct: function (target, args) {
          const url = getUrl(args[0]);
          const [href, mockData] = matchHref(args[0]);
          const isLocal = mockData && mockData.handlers !== undefined;

          if (mockData) {
            console.log(
              `mocking WebSocket response (with ${isLocal ? 'local' : 'remote'} data) for: ` +
                args[0],
            );
          }

          args[0] = href;

          const ws = Reflect.construct(target, args);
          let connection;

          if (isLocal) {
            connection = connectStream('ws', url, parseProtocols(args[1]), ws);

            if (connection) {
              ws.addEventListener('close', function (event) {
                connection._onClose(event.code, event.reason);
              });
              ws.addEventListener = new Proxy(ws.addEventListener, {
                apply(target, ctx, args) {
                  const [event, callback] = args;

                  if (event === 'message') {
                    mockData.handlers.message = callback;
                    connection.handlers.message = callback;
                  }

                  return Reflect.apply(target, ctx, args);
                },
              });
              defineHandlersOnMessage(mockData.handlers, ws);
              defineHandlersOnMessage(connection.handlers, ws);
            }
          }

          if (mockData && (mockData.callback || connection)) {
            ws.send = new Proxy(ws.send, {
              apply(target, ctx, args) {
                const result = Reflect.apply(target, ctx, args);

                if (connection) {
                  connection._emit('message', args[0]);
                }
                if (mockData.callback) {
                  mockData.callback(args[0]);
                }

                return result;
              },
            });
          }

          return ws;
        },
      });
    }
  }

  window.dvlp = {
    events,
    cache,
    /**
     * Disable all external network connections
     *
     * @returns { void }
     */
    disableNetwork() {
      networkDisabled = true;
    },

    /**
     * Re-enable all external network connections
     *
     * @returns { void }
     */
    enableNetwork() {
      networkDisabled = false;
    },

    /**
     * Add mock response for "req"
     *
     * @param { string | MockRequest } req
     * @param { MockResponse | MockResponseHandler } [res]
     * @param { boolean } [once]
     * @param { () => void } [onMockCallback]
     * @returns { MockedResponse } remove mock instance when called;
     *  exposes matched requests via "calls"
     */
    mockResponse(req, res, once = false, onMockCallback) {
      const ignoreSearch = (isMockRequest(req) && req.ignoreSearch) || false;
      const url = getUrl(req);
      const originRegex = new RegExp(
        url.origin.replace(/http:|https:/, 'https?:').replace('//', '\\/\\/'),
      );
      const pathRegex = new RegExp(url.pathname.replaceAll(/\//g, '\\/'));

      if (typeof res !== 'function') {
        if (res && res.body == null) {
          res = { body: res, headers: {} };
        }
      }

      const mock = {
        callback: onMockCallback,
        calls: [],
        href: url.href,
        ignoreSearch,
        once,
        originRegex,
        pathRegex,
        response: res,
        search: url.search,
      };

      cache.unshift(mock);

      const mockedResponse = () => {
        remove(mock);
      };
      mockedResponse.calls = mock.calls;

      return mockedResponse;
    },

    /**
     * Register a mock stream at "url", returning a handle exposing live
     * connections for per-connection send/close, and stream-wide push
     *
     * @param { string } url
     * @param { MockStreamOptions } [options]
     * @returns { MockStream }
     */
    mockStream(url, options) {
      const streamUrl = getUrl(url);
      const key = getStreamKey(streamUrl);
      let stream = streams.get(key);

      if (stream !== undefined && stream._explicit) {
        // Replace previously registered stream
        stream.destroy();
        stream = undefined;
      }

      if (stream === undefined) {
        // Adopts connections already tracked for "url", if any
        stream = createStream(
          streamUrl,
          streamUrl.protocol.startsWith('ws') ? 'ws' : 'es',
        );
        streams.set(key, stream);
      }

      stream._explicit = true;
      stream.options = options || {};

      // Ensure the EventSource/WebSocket proxies intercept connections
      // to "url", unless an existing local stream mock already does
      const mockData = findMock(streamUrl);

      if (!mockData || mockData.handlers === undefined) {
        stream._mockData = createStreamMockData(streamUrl, true);
        cache.unshift(stream._mockData);
      }

      return stream;
    },

    /**
     * Register mock push "events" for "stream"
     *
     * @param { string | MockPushStream } stream
     * @param { MockPushEvent | Array<MockPushEvent> } events
     * @param { () => void } [onSendCallback]
     * @returns { () => void } remove mock instance
     */
    mockPushEvents(stream, events, onSendCallback) {
      if (!Array.isArray(events)) {
        events = [events];
      }
      const ignoreSearch =
        (isMockRequest(stream) && stream.ignoreSearch) || false;
      const url = getUrl(stream);
      /** @type { MockStreamDataType } */
      const type = url.protocol.startsWith('ws') ? 'ws' : 'es';
      // Default to socket.io protocol for ws
      const protocol = (isMockRequest(stream) && stream.protocol) || type;
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

      /** @type { DeserializedMock & { callback?: (data: any) => void; handlers: Record<string, (event: MessageEvent) => void> } } */
      const mock = createStreamMockData(url, ignoreSearch);

      mock.events = eventsData;
      mock.callback = onSendCallback;

      this.cache.unshift(mock);

      return () => {
        delete mock.handlers;
        remove(mock);
      };
    },

    /**
     * Trigger EventSource/WebSocket event
     *
     * @param { string } stream
     * @param { string | { message: string | object, options: { event: string, id: string } } } event
     */
    async pushEvent(stream, event) {
      const [, mockData] = matchHref(stream);

      if (!mockData) {
        throw Error(`no push event mocks registerd for ${stream}`);
      }

      if (!mockData.handlers) {
        return originalFetch('/dvlp/push-event', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          // Note: this bridge is JSON-only; push binary messages
          // server-side via testServer.pushEvent instead
          body: JSON.stringify({ stream, event }),
        });
      }

      if (typeof event === 'string') {
        const eventSequence = mockData.events[event];

        if (eventSequence) {
          for (const event of eventSequence) {
            const {
              message,
              options: { delay = 0, ...options },
            } = event;

            await sleep(delay);
            dispatchStreamEvent(stream, mockData, message, options);
          }
        }
      } else {
        const { message, options = {} } = event;

        dispatchStreamEvent(
          stream,
          mockData,
          typeof message !== 'string' ? JSON.stringify(message) : message,
          options,
        );
      }
    },
  };

  function sleep(duration) {
    return new Promise((resolve) => setTimeout(resolve, duration));
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
   * Retrieve resolved href and mock data for "href"
   *
   * @param { string | Request } href
   * @returns { [string, MockResponseData | MockStreamData] }
   */
  function matchHref(href) {
    const url = getUrl(href);

    if (url.pathname === '/dvlp/reload') {
      return [href];
    }

    const mockData = findMock(url);

    if (mockData) {
      if (mockData.once) {
        remove(mockData);
      }
      href =
        (RE_WEB_SOCKET_PROTOCOL.test(url.protocol)
          ? 'ws:'
          : location.protocol) +
        '//' +
        location.host +
        location.pathname +
        '?dvlpmock=' +
        encodeURIComponent(url.href);
    } else if (location.host !== url.host) {
      if (networkDisabled) {
        throw Error(
          'network connections disabled. Unable to request ' +
            parseOriginalHref(href),
        );
      }
    }

    return [href, mockData];
  }

  /**
   * Find mock in "cache" matching "url"
   *
   * @param { URL } url
   * @returns { MockResponseData | MockStreamData | undefined }
   */
  function findMock(url) {
    // Fix Edge URL.origin
    const origin =
      url.origin.indexOf(url.host) === -1 ? url.origin + url.host : url.origin;

    for (let i = 0; i < cache.length; i++) {
      const mock = cache[i];

      if (
        !mock.originRegex.test(origin) ||
        (!mock.ignoreSearch &&
          mock.search &&
          !isEqualSearch(url.search, mock.search))
      ) {
        continue;
      }

      if (mock.pathRegex.exec(url.pathname) != null) {
        return mock;
      }
    }
  }

  /**
   * Record request matching "mockData" on its "calls" array,
   * mirroring the node mock's MockRequestCall shape
   *
   * @param { MockResponseData } mockData
   * @param { string } href
   * @param { string } [method]
   * @param { Record<string, string> } headers
   * @param { unknown } [body]
   */
  function recordCall(mockData, href, method, headers, body) {
    const call = {
      body: undefined,
      headers,
      method: method ? String(method).toUpperCase() : 'GET',
      url: parseOriginalHref(href),
    };

    mockData.calls.push(call);

    if (typeof body === 'string') {
      if (body.length > 0) {
        call.body = body;
      }
    } else if (body instanceof URLSearchParams) {
      call.body = body.toString();
    } else if (body && typeof body.text === 'function') {
      // Blob or cloned Request: "call.body" is populated when the body
      // read completes, mirroring the node mock's async body capture
      body.text().then(
        function (text) {
          if (text.length > 0) {
            call.body = text;
          }
        },
        function () {},
      );
    }
  }

  /**
   * Record fetch request matching "mockData" on its "calls" array
   *
   * @param { MockResponseData } mockData
   * @param { string } href
   * @param { string | URL | Request } request
   * @param { Object } options
   */
  function recordFetchCall(mockData, href, request, options) {
    const isRequest =
      typeof Request !== 'undefined' && request instanceof Request;

    recordCall(
      mockData,
      href,
      options.method || (isRequest ? request.method : undefined),
      parseRequestHeaders(
        options.headers || (isRequest ? request.headers : undefined),
      ),
      options.body != null
        ? options.body
        : isRequest
          ? request.clone()
          : undefined,
    );
  }

  /**
   * Normalize fetch headers init (Headers | entries | object) to a plain object
   *
   * @param { unknown } [headers]
   * @returns { Record<string, string> }
   */
  function parseRequestHeaders(headers) {
    const parsed = {};

    if (headers) {
      if (Array.isArray(headers)) {
        for (const entry of headers) {
          parsed[String(entry[0]).toLowerCase()] = entry[1];
        }
      } else if (typeof headers.forEach === 'function') {
        // Headers instance
        headers.forEach(function (value, name) {
          parsed[name] = value;
        });
      } else {
        for (const name in headers) {
          parsed[name.toLowerCase()] = headers[name];
        }
      }
    }

    return parsed;
  }

  /**
   * Resolve response from "mockData"
   *
   * @param { MockResponseData } mockData
   * @param { Object } [requestOptions]
   * @returns { { body: string, headers: {}, status: number } }
   */
  function resolveMockResponse(mockData, requestOptions = {}) {
    const mockResponse = mockData.response;
    const resolved = {
      body: '',
      headers: mockData.response.headers || {},
      status: 0,
    };

    if (typeof mockResponse === 'function') {
      requestOptions.url = mockData.href;
      mockResponse(requestOptions, {
        end: function end(data) {
          resolved.body = data;
        },
        setHeader: function setHeader(name, value) {
          resolved.headers[name] = value;
        },
        write: function write(chunk) {
          resolved.body += chunk;
        },
        writeHead: function writeHead(statusCode, headers) {
          resolved.status = statusCode;
          if (headers) {
            resolved.headers = headers;
          }
        },
      });
    } else if (mockResponse.error) {
      resolved.body = 'error';
      resolved.status = 500;
    } else if (mockResponse.missing) {
      resolved.body = 'missing';
      resolved.status = 404;
    } else if (!mockResponse.hang) {
      resolved.body = mockResponse.body;
      resolved.status = mockResponse.status || 200;
    }

    return resolved;
  }

  /**
   * Parse "href" into URL-like object
   *
   * @param { string | URL | Request } href
   * @returns { URL }
   */
  function getUrl(href) {
    if (href instanceof URL) {
      return href;
    }

    href = typeof href === 'string' ? href : href.url;
    return new URL(href, location.href);
  }

  /**
   * Remove "mockData" from cache
   *
   * @param { MockResponseData | MockStreamData } mockData
   */
  function remove(mockData) {
    for (let i = 0; i < cache.length; i++) {
      if (mockData === cache[i]) {
        cache.splice(i, 1);
      }
    }
  }

  /**
   * Create stream mock data for matching EventSource/WebSocket
   * connections to "url"
   *
   * @param { URL } url
   * @param { boolean } ignoreSearch
   * @returns { MockStreamData }
   */
  function createStreamMockData(url, ignoreSearch) {
    return {
      href: url.href,
      originRegex: new RegExp(
        url.origin.replace(/ws:|wss:/, 'wss?:').replace('//', '\\/\\/'),
      ),
      pathRegex: new RegExp(url.pathname.replaceAll(/\//g, '\\/')),
      search: url.search,
      ignoreSearch,
      events: {},
      handlers: {},
    };
  }

  /**
   * Retrieve cache key for stream at "url" (mirrors the node mock's
   * url cache key: host + pathname, search ignored)
   *
   * @param { URL } url
   * @returns { string }
   */
  function getStreamKey(url) {
    // Map loopback address to localhost
    const host = url.host === '127.0.0.1' ? 'localhost' : url.host;
    let key = host + url.pathname;

    if (key.endsWith('/')) {
      key = key.slice(0, -1);
    }

    return key;
  }

  /**
   * Create MockStream handle for stream at "url"
   *
   * @param { URL } url
   * @param { MockStreamDataType } type
   * @returns { MockStream }
   */
  function createStream(url, type) {
    const stream = {
      url,
      type,
      connections: [],
      options: {},
      _explicit: false,
      _mockData: undefined,
      pushEvent: function pushEvent(event) {
        return window.dvlp.pushEvent(stream.url.href, event);
      },
      destroy: function destroy() {
        for (const connection of stream.connections.slice()) {
          connection.close();
        }
        stream.connections.length = 0;

        if (stream._mockData) {
          remove(stream._mockData);
          stream._mockData = undefined;
        }

        const key = getStreamKey(stream.url);

        if (streams.get(key) === stream) {
          streams.delete(key);
        }
      },
    };

    return stream;
  }

  /**
   * Register a connection for "client" on the stream at "url",
   * creating an implicit stream when none has been registered.
   * Returns undefined when rejected by the stream's "authorize" option
   *
   * @param { MockStreamDataType } type
   * @param { URL } url
   * @param { Array<string> } protocols
   * @param { EventSource | WebSocket } client
   * @returns { MockStreamConnection | undefined }
   */
  function connectStream(type, url, protocols, client) {
    const key = getStreamKey(url);
    let stream = streams.get(key);

    if (stream === undefined) {
      stream = createStream(url, type);
      streams.set(key, stream);
    }

    if (
      stream.options.authorize &&
      !stream.options.authorize({ headers: {}, protocols, url })
    ) {
      // No in-page 401: close the client and surface an error instead
      setTimeout(function () {
        // Closing a connecting WebSocket fails the connection, which fires
        // "error" natively; EventSource (and an open WebSocket) close silently
        const closesSilently =
          type === 'es' || client.readyState !== WebSocket.CONNECTING;

        client.close();

        if (closesSilently) {
          client.dispatchEvent(new Event('error'));
        }
      }, 0);
      return undefined;
    }

    const connection = createStreamConnection(
      type,
      url,
      protocols,
      client,
      stream,
    );

    stream.connections.push(connection);

    if (stream.options.onConnection) {
      stream.options.onConnection(connection);
    }

    return connection;
  }

  /**
   * Create MockStreamConnection handle wrapping "client"
   *
   * @param { MockStreamDataType } type
   * @param { URL } url
   * @param { Array<string> } protocols
   * @param { EventSource | WebSocket } client
   * @param { MockStream } stream
   * @returns { MockStreamConnection }
   */
  function createStreamConnection(type, url, protocols, client, stream) {
    const listeners = { close: [], message: [] };
    const connection = {
      id: 'connection-' + ++connectionCount,
      type,
      url,
      // Request headers are not readable in-page
      headers: {},
      protocols,
      closed: false,
      handlers: {},
      send: function send(message, options) {
        if (!connection.closed) {
          dispatchToHandlers(
            connection.handlers,
            encodeStreamMessage(message),
            options || {},
          );
        }
      },
      close: function close(code, reason) {
        if (connection.closed) {
          return;
        }

        try {
          client.close(code, reason);
        } catch {
          // Browser WebSocket.close() only permits codes 1000/3000-4999
          client.close();
        }
        connection._onClose(code, reason);
      },
      on: function on(event, handler) {
        listeners[event].push(handler);
        return connection;
      },
      once: function once(event, handler) {
        const wrapped = function (data) {
          connection.off(event, wrapped);
          handler(data);
        };

        return connection.on(event, wrapped);
      },
      off: function off(event, handler) {
        const index = listeners[event].indexOf(handler);

        if (index !== -1) {
          listeners[event].splice(index, 1);
        }

        return connection;
      },
      _emit: function emit(event, data) {
        for (const handler of listeners[event].slice()) {
          handler(data);
        }
      },
      _onClose: function onClose(code, reason) {
        if (connection.closed) {
          return;
        }

        connection.closed = true;

        const index = stream.connections.indexOf(connection);

        if (index !== -1) {
          stream.connections.splice(index, 1);
        }

        connection._emit('close', { code, reason });
      },
    };

    return connection;
  }

  /**
   * Dispatch push event "data" to all live connections for "streamHref",
   * falling back to the shared legacy handlers registered on "mockData"
   *
   * @param { string } streamHref
   * @param { MockStreamData } mockData
   * @param { unknown } data
   * @param { Object } options
   */
  function dispatchStreamEvent(streamHref, mockData, data, options) {
    const stream = streams.get(getStreamKey(getUrl(streamHref)));

    if (stream && stream.connections.length > 0) {
      for (const connection of stream.connections.slice()) {
        dispatchToHandlers(connection.handlers, data, options);
      }
      return;
    }

    dispatchToHandlers(mockData.handlers, data, options);
  }

  /**
   * Dispatch MessageEvent with "data" to the matching handler in "handlers"
   *
   * @param { Record<string, (event: MessageEvent) => void> } handlers
   * @param { unknown } data
   * @param { Object } options
   */
  function dispatchToHandlers(handlers, data, options) {
    const handler =
      handlers[options.event] || handlers.message || handlers.onmessage;

    if (typeof handler === 'function') {
      handler(
        new MessageEvent('message', {
          data,
          lastEventId: options.id || '',
        }),
      );
    }
  }

  /**
   * Mirror "client.onmessage" on "handlers"
   *
   * @param { Record<string, (event: MessageEvent) => void> } handlers
   * @param { EventSource | WebSocket } client
   */
  function defineHandlersOnMessage(handlers, client) {
    Object.defineProperty(handlers, 'onmessage', {
      configurable: true,
      get() {
        return client.onmessage;
      },
    });
  }

  /**
   * Encode "message" for MessageEvent data:
   * strings and binary pass through, objects are JSON-stringified
   *
   * @param { unknown } message
   * @returns { unknown }
   */
  function encodeStreamMessage(message) {
    if (
      typeof message === 'string' ||
      message instanceof ArrayBuffer ||
      ArrayBuffer.isView(message) ||
      (typeof Blob !== 'undefined' && message instanceof Blob)
    ) {
      return message;
    }

    return JSON.stringify(message);
  }

  /**
   * Parse WebSocket constructor "protocols" argument to an array
   *
   * @param { string | Array<string> } [protocols]
   * @returns { Array<string> }
   */
  function parseProtocols(protocols) {
    if (protocols === undefined) {
      return [];
    }

    return Array.isArray(protocols) ? protocols.slice() : [protocols];
  }

  /**
   * Determine if search params are equal
   *
   * @param { string } search1
   * @param { string } search2
   * @returns { boolean }
   */
  function isEqualSearch(search1, search2) {
    const searchMap1 = parseSearch(search1);
    const searchMap2 = parseSearch(search2);

    if (Object.keys(searchMap1).length !== Object.keys(searchMap2).length) {
      return false;
    }

    for (const key in searchMap1) {
      const values1 = searchMap1[key];
      const values2 = searchMap2[key];

      if (!values2 || values1.length !== values2.length) {
        return false;
      }

      for (let i = 0; i < values1.length; i++) {
        const value = values1[i];

        if (values2.indexOf(value) === -1) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Parse "search" into map by key
   *
   * @param { string } search
   * @returns { { [key: string]: Array<string> }}
   */
  function parseSearch(search) {
    search = search.slice(1).split('&');
    const searchMap = {};

    for (let i = 0; i < search.length; i++) {
      const keyVal = search[i].split('=');
      const key = keyVal[0];
      const val = keyVal[1];
      if (!(key in searchMap)) {
        searchMap[key] = [];
      }
      searchMap[key].push(val);
    }

    return searchMap;
  }

  /**
   * Parse original href from href with `?dvlpmock=` encoded href
   *
   * @param { string } hrefOrRequest
   * @returns { string }
   */
  function parseOriginalHref(hrefOrRequest) {
    const href =
      typeof hrefOrRequest === 'string' ? hrefOrRequest : hrefOrRequest.url;
    if (href.indexOf('?dvlpmock') === -1) {
      return href;
    }

    return decodeURIComponent(href.split('?dvlpmock=')[1]);
  }
})();
