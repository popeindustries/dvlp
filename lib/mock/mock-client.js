// @ts-nocheck
(function() {
  var RE_WEB_SOCKET_PROTOCOL = /wss?:/;

  var originalXMLHttpRequestOpen = window.XMLHttpRequest.prototype.open;
  var originalFetch = window.fetch;
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

  // IE11 friendly Proxy-less patch
  window.XMLHttpRequest.prototype.open = function open(method, url) {
    return originalXMLHttpRequestOpen.call(this, method, patchUrl(url));
  };

  if (typeof Proxy !== 'undefined') {
    if (typeof fetch !== 'undefined') {
      window.fetch = new Proxy(window.fetch, {
        apply: function(target, ctx, args) {
          args[0] = patchUrl(args[0]);
          return Reflect.apply(target, ctx, args);
        }
      });
    }
    if (typeof EventSource !== 'undefined') {
      window.EventSource = new Proxy(window.EventSource, {
        construct: function(target, args) {
          args[0] = patchUrl(args[0]);
          return Reflect.construct(target, args);
        }
      });
    }
    if (typeof WebSocket !== 'undefined') {
      window.WebSocket = new Proxy(window.WebSocket, {
        construct: function(target, args) {
          args[0] = patchUrl(args[0]);
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
    events,
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
        body: JSON.stringify({ stream, event })
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
        css.p
      );
      return undefined;
    }
  });
  Object.defineProperty(window.dvlp.pushEvent, 'help', {
    get: function() {
      console.log(
        '\n%cPushEvent: trigger EventSource/WebSocket event when mocking\n\n' +
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
   * Patch 'url' with redirected location if mocked
   *
   * @param { string | Request } href
   * @returns { string }
   */
  function patchUrl(href) {
    var url = getUrl(typeof href === 'string' ? href : href.url);
    var mockData = getMockData(url);

    if (mockData) {
      href =
        (RE_WEB_SOCKET_PROTOCOL.test(url.protocol)
          ? 'ws:'
          : location.protocol) +
        location.host +
        location.pathname +
        '?dvlpmock=' +
        encodeURIComponent(href) +
        (location.search ? '&' + location.search.slice(1) : '');
    }

    return href;
  }

  /**
   * Parse "href" into URL-like object
   * IE11 friendly
   *
   * @param { string } href
   * @returns { URL | { protocol: string, origin: string, pathname: string, search: string } }
   */
  function getUrl(href) {
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
        search: a.search
      };
    }
  }

  /**
   * Determine if "url" matches cached mock
   *
   * @param { URL | { protocol: string, origin: string, pathname: string, search: string } } url
   * @returns { boolean }
   */
  function getMockData(url) {
    // Fix Edge URL.origin
    var origin =
      url.origin.indexOf(url.host) === -1 ? url.origin + url.host : url.origin;

    for (var i = 0; i < cache.length; i++) {
      var mock = cache[i];
      if (
        !mock.originRegex.test(origin) ||
        (!mock.search && !isEqualSearch(url.search, mock.search))
      ) {
        continue;
      }

      if (mock.pathRegex.exec(url.pathname) != null) {
        return mock;
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

      if (values1.length !== values2.length) {
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
