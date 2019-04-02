(function() {
  if (typeof URL === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }

  const url = new URL(location.origin);

  url.port = $RELOAD_PORT;
  url.pathname = '/dvlpreload';

  let sse;
  let retries;

  connect();

  function connect() {
    sse = new EventSource(url.href);
    sse.onopen = () => {
      retries = 5;
    };
    sse.onerror = () => {
      sse.close();
      if (retries--) {
        connect();
      }
    };
    sse.addEventListener('reload', () => {
      location.reload();
    });
    sse.addEventListener('refresh', (event) => {
      const { filePath } = JSON.parse(event.data);
      const links = document.querySelectorAll('link');
      const localLinks = {};

      for (const link of links) {
        const url = new URL(link.href);

        if (url.origin.includes('localhost')) {
          localLinks[url.pathname.slice(1)] = link;
        }
      }

      if (filePath in localLinks) {
        localLinks[filePath].href = filePath;
      } else {
        // FilePath likely a concatenated dependency, so refresh all links
        for (const path in localLinks) {
          localLinks[path].href = path;
        }
      }
    });
  }
})();
