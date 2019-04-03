(function() {
  const RE_WEB_SOCKET_PROTOCOL = /wss?:/;

  const cache = new Map($MOCKS);

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

  window.dvlp = {
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
          RE_WEB_SOCKET_PROTOCOL.test(url.protocol)
            ? url.protocol
            : location.protocol
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
    return `${url.host}${url.pathname}`;
  }
})();
