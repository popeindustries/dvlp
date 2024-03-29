// @ts-nocheck
(function () {
  if (window.dvlp) {
    return;
  }

  const RE_WEB_SOCKET_PROTOCOL = /wss?:/;

  const originalXMLHttpRequestOpen = window.XMLHttpRequest.prototype.open;
  const originalFetch = window.fetch;
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
  let networkDisabled = false;
  let reroute = false;

  // IE11 friendly Proxy-less patch
  window.XMLHttpRequest.prototype.open = function open(method, href) {
    const hrefAndMock = matchHref(href);
    href = hrefAndMock[0];
    const mockData = hrefAndMock[1];

    if (mockData) {
      // Handle mock registered in browser
      if (mockData.response) {
        const xhr = this;
        const mockResponse = resolveMockResponse(mockData);

        this.send = function send() {
          // Hang
          if (mockResponse.status === 0) {
            return;
          }

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
      } else if (mockData.callback) {
        // Triggered on load/error/abort
        this.addEventListener('loadend', function () {
          mockData.callback();
        });
      }
    }

    return originalXMLHttpRequestOpen.call(this, method, href);
  };

  if (typeof Proxy !== 'undefined') {
    if (typeof fetch !== 'undefined') {
      window.fetch = new Proxy(window.fetch, {
        apply: function (target, ctx, args) {
          const options = args[1] || {};
          const hrefAndMock = matchHref(args[0]);
          const href = hrefAndMock[0];
          const mockData = hrefAndMock[1];

          args[0] = href;

          if (mockData) {
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
              return Promise.resolve(res);
            } else if (mockData.callback) {
              return Reflect.apply(target, ctx, args)
                .then(function (response) {
                  setTimeout(mockData.callback, 0);
                  return response;
                })
                .catch(function (err) {
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
          if (!args[0].includes('dvlpreload')) {
            args[0] = matchHref(args[0])[0];
            console.log(
              'mocking EventSource response (with remote data) for: ' + args[0],
            );
          }
          return Reflect.construct(target, args);
        },
      });
    }

    if (typeof WebSocket !== 'undefined') {
      window.WebSocket = new Proxy(window.WebSocket, {
        construct: function (target, args) {
          args[0] = matchHref(args[0])[0];
          console.log(
            'mocking WebSocket response (with remote data) for: ' + args[0],
          );
          return Reflect.construct(target, args);
        },
      });
    }
  }

  window.dvlp = {
    events,
    cache: cache,
    /**
     * Disable all external network connections
     * and optionally reroute all external requests to this server
     *
     * @param { boolean } [rerouteAllRequests]
     * @returns { void }
     */
    disableNetwork: function disableNetwork(rerouteAllRequests) {
      networkDisabled = true;
      reroute = rerouteAllRequests || false;
    },
    /**
     * Re-enable all external network connections
     *
     * @returns { void }
     */
    enableNetwork: function enableNetwork() {
      networkDisabled = false;
      reroute = false;
    },
    /**
     * Add mock response for "req"
     *
     * @param { string | MockRequest } req
     * @param { MockResponse | MockResponseHandler } [res]
     * @param { boolean } [once]
     * @param { () => void } [onMockCallback]
     * @returns { () => void } remove mock instance
     */
    mockResponse: function mockResponse(req, res, once, onMockCallback) {
      const ignoreSearch =
        (req &&
          typeof req === 'object' &&
          req.url !== undefined &&
          req.type === undefined &&
          req.ignoreSearch) ||
        false;
      const url = getUrl(req);
      const originRegex = new RegExp(
        url.origin
          .replace(/http:|https:/, 'https?:')
          .replace('ws:', 'wss?:')
          .replace('//', '\\/\\/'),
      );
      const pathRegex = new RegExp(url.pathname.replace(/\//g, '\\/'));

      if (typeof res !== 'function') {
        if (res && !res.body) {
          res = { body: res, headers: {} };
        }
      }

      const mock = {
        callback: onMockCallback,
        href: url.href,
        ignoreSearch: ignoreSearch,
        once: once || false,
        originRegex: originRegex,
        pathRegex: pathRegex,
        response: res,
        search: url.search,
      };

      cache.unshift(mock);

      return function () {
        remove(mock);
      };
    },
    /**
     * Trigger EventSource/WebSocket event
     *
     * @param { string } stream
     * @param { string | { message: string | object, options: { event: string, id: string } } } event
     */
    pushEvent: function pushEvent(stream, event) {
      originalFetch('/dvlp/push-event', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stream: stream, event: event }),
      });
    },
  };

  /**
   * Retrieve resolved href and mock data for "href"
   *
   * @param { string | Request } href
   * @returns { [string, MockResponseData | MockStreamData] }
   */
  function matchHref(href) {
    const url = getUrl(href);
    if (url.pathname === '/dvlpreload') {
      return [href];
    }

    // Fix Edge URL.origin
    const origin =
      url.origin.indexOf(url.host) === -1 ? url.origin + url.host : url.origin;
    let mockData;

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
        mockData = mock;
        break;
      }
    }

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
      if (reroute) {
        url.host = location.host;
        href = url.href;
      } else if (networkDisabled) {
        throw Error(
          'network connections disabled. Unable to request ' +
            parseOriginalHref(href),
        );
      }
    }

    return [href, mockData];
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
   * @param { string | Request } href
   * @returns { URL | { href: string, protocol: string, origin: string, pathname: string, search: string } }
   */
  function getUrl(href) {
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
   * Determine if search params are equal
   * IE11 friendly
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

    for (let key in searchMap1) {
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
   * Parse original href from href with `??dvlpmock=` encoded href
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
