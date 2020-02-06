// @ts-nocheck

(function() {
  const RE_WEB_SOCKET_PROTOCOL = /wss?:/;

  const cache = new Map($MOCKS);
  const events = {};

  for (const value of cache.values()) {
    for (const entry in value) {
      if (value[entry].events) {
        events[value[entry].url] = value[entry].events;
      }
    }
  }

  window.XMLHttpRequest.prototype.open = new Proxy(
    window.XMLHttpRequest.prototype.open,
    {
      apply(target, ctx, args) {
        return Reflect.apply(target, ctx, patchUrlArg(args, 1));
      }
    }
  );
  window.fetch = new Proxy(window.fetch, {
    apply(target, ctx, args) {
      return Reflect.apply(target, ctx, patchUrlArg(args, 0));
    }
  });
  window.EventSource = new Proxy(window.EventSource, {
    construct(target, args) {
      return Reflect.construct(target, patchUrlArg(args, 0));
    }
  });
  window.WebSocket = new Proxy(window.WebSocket, {
    construct(target, args) {
      return Reflect.construct(target, patchUrlArg(args, 0));
    }
  });

  const css = {
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
    pushEvent(stream, event) {
      fetch(`/dvlp/push-event`, {
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
    get() {
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
    get() {
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
            .map((url) => `  ${url}\n    ${events[url].join('\n    ')}`)
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
   * Patch 'url' argument at 'urlIndex' with redirected location if mocked
   *
   * @param { Array<any> } args
   * @param { number } urlIndex
   * @returns { object }
   */
  function patchUrlArg(args, urlIndex) {
    const url = new URL(args[urlIndex], location.origin);

    if (getMatch(url)) {
      const redirectUrl = new URL(
        `${
          RE_WEB_SOCKET_PROTOCOL.test(url.protocol) ? 'ws:' : location.protocol
        }${location.host}${location.pathname}`
      );

      redirectUrl.searchParams.append('dvlpmock', encodeURIComponent(url.href));
      args[urlIndex] = redirectUrl.href;
    }

    return args;
  }

  /**
   * Determine if 'url' matches cached mock
   *
   * @param { URL } url
   * @returns { boolean }
   */
  function getMatch(url) {
    const key = getCacheKey(url);
    const mock = cache.get(key);

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
   * Retrieve key for 'url'
   *
   * @param { URL } url
   * @returns { string }
   */
  function getCacheKey(url) {
    let key = `${url.host}${url.pathname}`;

    if (key.endsWith('/')) {
      key = key.slice(0, -1);
    }

    return key;
  }
})();
