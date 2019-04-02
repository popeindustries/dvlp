(function() {
  const cache = new Map($MOCKS);

  window.XMLHttpRequest.prototype.open = new Proxy(
    window.XMLHttpRequest.prototype.open,
    clientRequestApplyTrap(1)
  );
  window.fetch = new Proxy(window.fetch, clientRequestApplyTrap(0));
  window.EventSource = new Proxy(window.EventSource, clientRequestApplyTrap(0));
  window.WebSocket = new Proxy(window.WebSocket, clientRequestApplyTrap(0));

  /**
   * Create client request Proxy apply trap.
   * 'urlIndex' is the 'args' index position for 'url' argument
   *
   * @param { number } urlIndex
   * @returns { object }
   */
  function clientRequestApplyTrap(urlIndex) {
    return {
      apply(target, ctx, args) {
        const url = new URL(args[urlIndex], location.origin);

        if (getMatch(url)) {
          const redirectUrl = new URL(
            `${location.protocol}${location.host}${location.pathname}`
          );

          redirectUrl.searchParams.append('mock', encodeURIComponent(url.href));
          args[urlIndex] = redirectUrl.href;
        }

        return Reflect.apply(target, ctx, args);
      }
    };
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
