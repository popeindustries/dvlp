// @ts-nocheck
(function () {
  if (typeof URL === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }
  var sse;
  var retries = 4;
  var opened = false;
  var hostnames = ['localhost', location.hostname];
  var url = new URL('http://localhost');
  url.port = $RELOAD_PORT;
  url.pathname = '/dvlpreload';
  connect();

  function connect() {
    sse = new EventSource(url.href);
    sse.onopen = function () {
      // Reconnected after server restart
      if (opened) {
        location.reload();
      }
      opened = true;
    };
    sse.onerror = function () {
      if (!opened) {
        sse.close();
        if (retries-- >= 0) {
          // Try with alternate hostname
          url.hostname = hostnames[retries % 2];
          connect();
        }
      }
    };
    sse.addEventListener('reload', function () {
      location.reload();
    });
    sse.addEventListener('refresh', function (event) {
      try {
        var json = JSON.parse(event.data);
        var filePath = json.filePath;
        var linksAndImportRules = [];
        for (var i = 0; i < document.styleSheets.length; i++) {
          if (
            parseStylesheet(
              document.styleSheets[i],
              filePath,
              linksAndImportRules,
            )
          ) {
            return;
          }
        }
        // No match, possibly a concatenated dependency, so refresh everything
        for (var j = 0; j < linksAndImportRules.length; j++) {
          var linkOrImportRule = linksAndImportRules[j];
          if ('link' in linkOrImportRule) {
            replaceLink(linkOrImportRule.link);
          } else {
            reloadImportRule(linkOrImportRule.rule, linkOrImportRule.index);
          }
        }
      } catch (err) {
        location.reload();
      }
    });
  }

  // https://gist.github.com/gabemartin/1183957
  function parseStylesheet(stylesheet, filePath, linksAndImportRules) {
    if (stylesheet.href) {
      if (stylesheet.ownerNode) {
        if (filePathMatchesHref(filePath, stylesheet.href)) {
          return replaceLink(stylesheet.ownerNode);
        } else {
          linksAndImportRules.push({ link: stylesheet.ownerNode });
        }
      }
    }
    for (var i = 0; i < stylesheet.cssRules.length; i++) {
      var rule = stylesheet.cssRules[i];
      if (rule.type === CSSRule.IMPORT_RULE) {
        if (filePathMatchesHref(filePath, rule.href, stylesheet.href)) {
          return reloadImportRule(rule, i);
        } else {
          linksAndImportRules.push({ rule: rule, index: i });
        }
        return parseStylesheet(rule.styleSheet, filePath, linksAndImportRules);
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
