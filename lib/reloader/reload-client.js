// @ts-nocheck
(function() {
  if (typeof URL === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }

  var url = new URL(location.origin);

  url.port = $RELOAD_PORT;
  url.pathname = '/dvlpreload';

  var sse;
  var retries;

  connect();

  function connect() {
    sse = new EventSource(url.href);
    sse.onopen = function() {
      retries = 5;
    };
    sse.onerror = function() {
      sse.close();
      if (retries--) {
        connect();
      }
    };
    sse.addEventListener('reload', function() {
      location.reload();
    });
    sse.addEventListener('refresh', function(event) {
      try {
        var json = JSON.parse(event.data);
        var filePath = json.filePath;
        var links = document.querySelectorAll('link');
        var localLinks = {};
        var foundLinks = false;

        // Filter all local link tags
        for (var i = 0; i < links.length; i++) {
          var link = links[i];
          var url = new URL(link.href);

          if (
            url.origin.includes('localhost') &&
            (link.rel === undefined || link.rel.includes('stylesheet'))
          ) {
            foundLinks = true;
            localLinks[url.pathname] = link;
          }
        }

        // No local link tags found, so force reload
        if (!foundLinks) {
          return location.reload();
        }

        if (filePath in localLinks) {
          localLinks[filePath].href = filePath;
        } else {
          // FilePath likely a concatenated dependency, so refresh all links
          for (var path in localLinks) {
            localLinks[path].href = path;
          }
        }
      } catch (err) {
        return;
      }
    });
  }
})();
