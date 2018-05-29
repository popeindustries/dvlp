/* global document, location, EventSource, PORT */

(function() {
  if (typeof URL === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }

  const url = new URL(location.origin);

  url.port = PORT;
  url.pathname = '/reload';

  const sse = new EventSource(url.href);

  sse.addEventListener('refresh', (event) => {
    const { type, filepath } = JSON.parse(event.data);

    if (type === 'css') {
      for (const link of document.querySelectorAll('link')) {
        const url = new URL(link.href);

        if (url.pathname.slice(1) == filepath) {
          link.href = link.href;
        }
      }
    }
  });
  sse.addEventListener('reload', () => {
    location.reload();
  });
})();
