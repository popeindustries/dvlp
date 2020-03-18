// @ts-nocheck
(function() {
  var RE_WEB_SOCKET_PROTOCOL = /wss?:/;

  var originalXMLHttpRequestOpen = window.XMLHttpRequest.prototype.open;
  var originalFetch = window.fetch;
  /** @type {Array<MockResponseData | MockStreamData>} */
  var cache = $MOCKS.map(function(mockData) {
    mockData.originRegex = new RegExp(mockData.originRegex);
    mockData.pathRegex = new RegExp(mockData.pathRegex);
    return mockData;
  });
  var events = cache.reduce(function(events, mockData) {
    if (mockData.events) {
      events[mockData.href] = mockData.events;
    }
    return events;
  }, {});
  var networkDisabled = false;
  var reroute = false;

  // IE11 friendly Proxy-less patch
  window.XMLHttpRequest.prototype.open = function open(method, href) {
    var hrefAndMock = matchHref(href);
    href = hrefAndMock[0];
    var mockData = hrefAndMock[1];

    if (mockData && mockData.response) {
      var xhr = this;
      var mockResponse = resolveMockResponse(mockData.response);

      this.send = function send() {
        // Hang
        if (mockResponse.status === 0) {
          return;
        }

        Object.defineProperties(xhr, {
          response: {
            get: function() {
              return xhr.responseType === 'json'
                ? mockResponse.body
                : JSON.stringify(mockResponse.body);
            }
          },
          status: {
            get: function() {
              return mockResponse.status;
            }
          }
        });
        xhr.onload();
      };
    }

    return originalXMLHttpRequestOpen.call(this, method, href);
  };

  if (typeof Proxy !== 'undefined') {
    if (typeof fetch !== 'undefined') {
      window.fetch = new Proxy(window.fetch, {
        apply: function(target, ctx, args) {
          var hrefAndMock = matchHref(args[0]);
          var href = hrefAndMock[0];
          var mockData = hrefAndMock[1];

          if (mockData && mockData.response) {
            var mockResponse = resolveMockResponse(mockData.response);

            // Hang
            if (mockResponse.status === 0) {
              return new Promise(
                function() {},
                function() {}
              );
            }

            var res = new Response(JSON.stringify(mockResponse.body), {
              headers: mockResponse.headers,
              status: mockResponse.status
            });
            return Promise.resolve(res);
          }

          args[0] = href;
          return Reflect.apply(target, ctx, args);
        }
      });
    }
    if (typeof EventSource !== 'undefined') {
      window.EventSource = new Proxy(window.EventSource, {
        construct: function(target, args) {
          args[0] = matchHref(args[0])[0];
          return Reflect.construct(target, args);
        }
      });
    }
    if (typeof WebSocket !== 'undefined') {
      window.WebSocket = new Proxy(window.WebSocket, {
        construct: function(target, args) {
          args[0] = matchHref(args[0])[0];
          return Reflect.construct(target, args);
        }
      });
    }
  }

  var css = {
    h1:
      'color: hotpink; font-size: 14px; font-weight: bold; text-decoration: underline dotted',
    h2: 'color: hotpink; font-weight: bold; text-decoration: underline dotted',
    h3: 'color: grey; font-weight: bold',
    p: 'color: grey',
    code: 'color: grey; font-style: italic',
    codeHeavy: 'color: grey; font-style: italic; font-weight: bold'
  };

  window.dvlp = {
    events: events,
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
     * @param { MockResponse } res
     * @param { boolean } [once]
     * @returns { () => void } remove mock instance
     */
    addResponse: function addResponse(req, res, once) {
      var ignoreSearch =
        (req &&
          typeof req === 'object' &&
          req.url !== undefined &&
          req.type === undefined &&
          req.ignoreSearch) ||
        false;
      var url = getUrl(req);
      var originRegex = new RegExp(
        url.origin
          .replace(/http:|https:/, 'https?:')
          .replace('ws:', 'wss?:')
          .replace('//', '\\/\\/')
      );
      var pathRegex = new RegExp(url.pathname.replace(/\//g, '\\/'));

      if (typeof res !== 'function') {
        if (!res.body) {
          res = { body: res, headers: {} };
        }
      }

      var mock = {
        href: url.href,
        ignoreSearch: ignoreSearch,
        once: once || false,
        originRegex: originRegex,
        pathRegex: pathRegex,
        response: res,
        search: url.search
      };

      cache.unshift(mock);

      return function() {
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stream: stream, event: event })
      });
    }
  };

  Object.defineProperty(window.dvlp, 'help', {
    get: function() {
      console.log(
        '\n%cWelcome to the dvlp client command-line interface!\n\n' +
          '%cUsage:' +
          '%c dvlp.<command>\n\n' +
          '%cCommands:\n' +
          '%c  disableNetwork' +
          '%c - disable all external network connections (' +
          '%cdvlp.disableNetwork.help' +
          '%c for more)\n' +
          '%c  enableNetwork' +
          '%c - re-enable previously disabled external network connections (' +
          '%cdvlp.enableNetwork.help' +
          '%c for more)\n' +
          '%c  addResponse' +
          '%c - add mock response (' +
          '%cdvlp.addResponse.help' +
          '%c for more)\n' +
          '%c  pushEvent' +
          '%c - trigger EventSource/WebSocket event when mocking (' +
          '%cdvlp.pushEvent.help' +
          '%c for more)\n',
        css.h1,
        css.h2,
        css.codeHeavy,
        css.h2,
        css.h3,
        css.p,
        css.code,
        css.p,
        css.h3,
        css.p,
        css.code,
        css.p,
        css.h3,
        css.p,
        css.code,
        css.p,
        css.h3,
        css.p,
        css.code,
        css.p
      );
      return undefined;
    }
  });
  Object.defineProperty(window.dvlp.disableNetwork, 'help', {
    get: function() {
      console.log(
        '\n%cdisableNetwork: disable all external network connections\n\n' +
          '%cUsage:' +
          '%c dvlp.disableNetwork(rerouteAllRequests:' +
          '%c boolean' +
          '%c)\n\n' +
          '%cArguments:\n' +
          '%c  rerouteAllRequests:' +
          '%c boolean' +
          '%c - flag to reroute all external requests to this server\n\n',
        css.h1,
        css.h2,
        css.codeHeavy,
        css.code,
        css.codeHeavy,
        css.h2,
        css.codeHeavy,
        css.code,
        css.p
      );
      return undefined;
    }
  });
  Object.defineProperty(window.dvlp.enableNetwork, 'help', {
    get: function() {
      console.log(
        '\n%cenableNetwork: re-enable previously disabled external network connections\n\n' +
          '%cUsage:' +
          '%c dvlp.enableNetwork()\n\n',
        css.h1,
        css.h2,
        css.codeHeavy
      );
      return undefined;
    }
  });
  Object.defineProperty(window.dvlp.addResponse, 'help', {
    get: function() {
      console.log(
        '\n%caddResponse: add mock response\n\n' +
          '%cUsage:' +
          '%c dvlp.addResponse(req:' +
          '%c string|MockRequest' +
          '%c, res:' +
          '%c MockResponse' +
          '%c, once?:' +
          '%c boolean' +
          '%c): () => void\n\n' +
          '%cArguments:\n' +
          '%c  req:' +
          '%c string|MockRequest' +
          '%c - the request href string or MockRequest object\n' +
          '%c  res:' +
          '%c MockResponse' +
          '%c - the MockResponse object\n' +
          '%c  [once]:' +
          '%c boolean' +
          '%c - flag to automatically remove mock after first use\n\n' +
          '%cReturns:\n' +
          '%c  a remove function\n\n' +
          '%cExamples:\n' +
          '%c  // Add mock json api response \n' +
          '  dvlp.addResponse("http://someapi.com", { body: { text: "hi" } }, false);\n\n' +
          '  // Add one-time mock error response \n' +
          '  dvlp.addResponse("http://someapi.com", { body: {}, error: true }, true);\n\n',
        css.h1,
        css.h2,
        css.codeHeavy,
        css.code,
        css.codeHeavy,
        css.code,
        css.codeHeavy,
        css.code,
        css.codeHeavy,
        css.h3,
        css.codeHeavy,
        css.code,
        css.p,
        css.codeHeavy,
        css.code,
        css.p,
        css.codeHeavy,
        css.code,
        css.p,
        css.h3,
        css.p,
        css.h3,
        css.code
      );
      return undefined;
    }
  });
  Object.defineProperty(window.dvlp.pushEvent, 'help', {
    get: function() {
      console.log(
        '\n%cpushEvent: trigger EventSource/WebSocket event when mocking\n\n' +
          '%cUsage:' +
          '%c dvlp.pushEvent(stream:' +
          '%c string' +
          '%c, event:' +
          '%c string|object' +
          '%c)\n\n' +
          '%cArguments:\n' +
          '%c  stream:' +
          '%c string' +
          '%c - the mocked EventSource/WebSocket connection endpoint\n' +
          '%c  event:' +
          '%c string' +
          '%c - the "name" of a mocked event\n' +
          '%c  event:' +
          '%c {message, options}' +
          '%c - event object\n' +
          '%c    message:' +
          '%c string|object' +
          '%c - the event payload as string or JSON object\n' +
          '%c    [options]:' +
          '%c {event: string, id: string}' +
          '%c - optional EventSource "event" name and "id"\n\n' +
          '%cExamples:\n' +
          '%c  // Push mock event named "newsfeed with 9 items"\n' +
          '  dvlp.pushEvent("http://localhost:8000/feed", "newsfeed with 9 items");\n\n' +
          '  // Push event with string message payload\n' +
          '  dvlp.pushEvent("http://localhost:8000/feed", {message: "some news"});\n\n' +
          '  // Push event with object message payload and EventSource event name\n' +
          '  dvlp.pushEvent("http://localhost:8000/feed", {\n    message: {item: "some news"},\n    options: {event: "news"}\n  });\n\n' +
          '%cSee:' +
          '%c https://github.com/popeindustries/dvlp#mocking\n\n' +
          '%cCurrently mocked events:\n' +
          '%c' +
          Object.keys(events)
            .map(function(url) {
              return '  ' + url + '\n    ' + events[url].join('\n    ');
            })
            .join('\n') +
          '\n',
        css.h1,
        css.h2,
        css.codeHeavy,
        css.code,
        css.codeHeavy,
        css.code,
        css.codeHeavy,
        css.h2,
        css.codeHeavy,
        css.code,
        css.p,
        css.codeHeavy,
        css.code,
        css.p,
        css.codeHeavy,
        css.code,
        css.p,
        css.codeHeavy,
        css.code,
        css.p,
        css.codeHeavy,
        css.code,
        css.p,
        css.h2,
        css.code,
        css.h2,
        css.h3,
        css.h2,
        css.codeHeavy
      );
      return undefined;
    }
  });

  /**
   * Retrieve resolved href and mock data for "href"
   *
   * @param { string | Request } href
   * @returns { [string, MockResponseData | MockStreamData] }
   */
  function matchHref(href) {
    var url = getUrl(href);
    // Fix Edge URL.origin
    var origin =
      url.origin.indexOf(url.host) === -1 ? url.origin + url.host : url.origin;
    var mockData;

    for (var i = 0; i < cache.length; i++) {
      var mock = cache[i];

      if (
        !mock.originRegex.test(origin) ||
        (mock.search && !isEqualSearch(url.search, mock.search))
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
        location.host +
        location.pathname +
        '?dvlpmock=' +
        encodeURIComponent(href) +
        (location.search ? '&' + location.search.slice(1) : '');
    } else if (location.host !== url.host) {
      if (reroute) {
        url.host = location.host;
        href = url.href;
      } else if (networkDisabled) {
        throw Error('network connections disabled. Unable to request ' + href);
      }
    }

    return [href, mockData];
  }

  /**
   * Resolve response from "mockData"
   *
   * @param { MockResponse } mockResponse
   * @returns { { body: string, status: number }}
   */
  function resolveMockResponse(mockResponse) {
    var resolved = {
      body: '',
      headers: mockResponse.headers || {},
      status: 0
    };

    if (mockResponse.error) {
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
   * IE11 friendly
   *
   * @param { string | Request } href
   * @returns { URL | { href: string, protocol: string, origin: string, pathname: string, search: string } }
   */
  function getUrl(href) {
    href = typeof href === 'string' ? href : href.url;

    try {
      return new URL(href);
    } catch (err) {
      var a = document.createElement('a');
      a.href = href;
      return {
        protocol: a.protocol,
        host: a.host,
        origin: a.protocol + '//' + a.host,
        pathname: (a.pathname.charAt(0) !== '/' ? '/' : '') + a.pathname,
        search: a.search,
        get href() {
          return this.origin + this.pathaname + this.search;
        }
      };
    }
  }

  /**
   * Remove "mockData" from cache
   *
   * @param { MockResponseData | MockStreamData } mockData
   */
  function remove(mockData) {
    for (var i = 0; i < cache.length; i++) {
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
    var searchMap1 = parseSearch(search1);
    var searchMap2 = parseSearch(search2);

    if (Object.keys(searchMap1).length !== Object.keys(searchMap2).length) {
      return false;
    }

    for (var key in searchMap1) {
      var values1 = searchMap1[key];
      var values2 = searchMap2[key];

      if (!values2 || values1.length !== values2.length) {
        return false;
      }

      for (var i = 0; i < values1.length; i++) {
        var value = values1[i];

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
    var searchMap = {};

    for (var i = 0; i < search.length; i++) {
      var keyVal = search[i].split('=');
      var key = keyVal[0];
      var val = keyVal[1];
      if (!(key in searchMap)) {
        searchMap[key] = [];
      }
      searchMap[key].push(val);
    }

    return searchMap;
  }
})();
