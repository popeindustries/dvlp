// @ts-nocheck
(function() {
  if (typeof URL === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }
  var sse;
  var retries;
  var url = new URL(location.origin);
  url.port = $RELOAD_PORT;
  url.pathname = '/dvlpreload';
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
        for (var i = 0; i < document.styleSheets.length; i++) {
          if (reloadStylesheet(document.styleSheets[i], filePath)) {
            return;
          }
        }
        // No match, possibly a concatenated dependency, so refresh all links
        var links = document.querySelectorAll('link');
        var foundLinks = false;
        for (var k = 0; k < links.length; k++) {
          var link = links[k];
          var url = new URL(link.href);
          if (
            url.origin.includes('localhost') &&
            (link.rel === undefined || link.rel.includes('stylesheet'))
          ) {
            foundLinks = true;
            replaceLink(link);
          }
        }
        if (!foundLinks) {
          throw Error('no local link tags found');
        }
      } catch (err) {
        location.reload();
      }
    });
  }

  // https://gist.github.com/gabemartin/1183957
  function reloadStylesheet(stylesheet, filePath) {
    if (stylesheet.href) {
      if (filePathMatchesHref(filePath, stylesheet.href)) {
        if (stylesheet.ownerNode) {
          return replaceLink(stylesheet.ownerNode);
        }
      }
    }
    for (var i = 0; i < stylesheet.cssRules.length; i++) {
      var rule = stylesheet.cssRules[i];
      if (rule.type === CSSRule.IMPORT_RULE) {
        if (filePathMatchesHref(filePath, rule.href, stylesheet.href)) {
          return reloadImportRule(rule, i);
        }
        return reloadStylesheet(rule.styleSheet, filePath);
      }
    }
    return false;
  }

  function filePathMatchesHref(filePath, href, referrer) {
    referrer = referrer || location.href;
    var url = new URL(href, referrer);
    return url.origin.includes('localhost') && url.pathname === filePath;
  }

  function replaceLink(link) {
    var clone = link.cloneNode(false);
    var parent = link.parentNode;
    if (parent) {
      parent.removeChild(link);
      if (parent.lastChild === link) {
        parent.appendChild(clone);
      } else {
        parent.insertBefore(clone, link.nextSibling);
      }
    }
    return true;
  }

  function reloadImportRule(rule, index) {
    var parent = rule.parentStyleSheet;
    parent.insertRule(rule.cssText, index);
    parent.deleteRule(index + 1);
    return true;
  }
})();
