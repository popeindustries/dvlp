/* global document, EventSource */

(function() {
  const url = new URL(document.currentScript.src);
  const sse = new EventSource(`${url.origin}/reload`);

  sse.onmessage = (event) => {
    console.log(event);
  };
})();
