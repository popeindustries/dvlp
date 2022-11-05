(function () {
  if (typeof URL === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }
  const INIT_RECONNECT_TIMEOUT = 1000;
  const MAX_RECONNECT_TIMEOUT = 16000;
  /** @type { EventSource } */
  let sse;
  let connected = false;
  let currentReconnectTimeout = INIT_RECONNECT_TIMEOUT;
  let reconnectAttempts = 100;
  let reconnectTimeoutId = 0;
  const url = new URL(location.protocol + '//' + location.hostname);
  url.pathname = '$RELOAD_PATHNAME';
  if (location.port) {
    url.port = location.port;
  }

  /** @type { { sheets: Array<CSSStyleSheet>, add(sheets: Array<CSSStyleSheet>): void } } */
  // @ts-expect-error - patched
  const adoptedStyleSheetsCollector = customElements.adoptedStyleSheets;
  /** @type { Map<string, CSSStyleSheet> } */
  const adoptedStyleSheets = new Map();

  adoptedStyleSheetsCollector.add = function add(sheets) {
    for (const sheet of sheets) {
      adoptedStyleSheets.set(
        getFingerprint(getSheetRulesAsString(sheet)),
        sheet,
      );
    }
  };

  adoptedStyleSheetsCollector.add(adoptedStyleSheetsCollector.sheets);
  adoptedStyleSheetsCollector.sheets = [];

  connect();

  function connect() {
    clearTimeout(reconnectTimeoutId);
    sse = new EventSource(url.href);
    sse.onopen = function () {
      clearTimeout(reconnectTimeoutId);
      // Force reload after server restart
      if (connected) {
        location.reload();
      }
      connected = true;
      currentReconnectTimeout = INIT_RECONNECT_TIMEOUT;
    };
    sse.onerror = function (event) {
      sse.close();
      if (--reconnectAttempts > 0) {
        reconnectTimeoutId = window.setTimeout(
          connect,
          currentReconnectTimeout,
        );
        // Exponential backoff
        if (currentReconnectTimeout < MAX_RECONNECT_TIMEOUT) {
          currentReconnectTimeout *= 2;
        }
      }
    };
    sse.addEventListener('reload', function () {
      location.reload();
    });
    sse.addEventListener('refresh', function (event) {
      try {
        const { assert, fingerprint, href, type } =
          /** @type { RequestContext } */ (JSON.parse(event.data));

        if (type === 'css') {
          if (assert === 'css') {
            if (fingerprint !== undefined) {
              reloadAdoptedStyles(href, fingerprint);
            } else {
              throw Error('missing fingerprint');
            }
          } else {
            reloadGlobalStyles(href);
          }
        } else {
          throw Error('unsuported refresh type');
        }
      } catch (err) {
        location.reload();
      }
    });
  }

  /**
   * @param { string } href
   * @param { string } fingerprint
   */
  function reloadAdoptedStyles(href, fingerprint) {
    const url = new URL(href, location.origin);
    url.searchParams.append('t', String(Date.now()));

    import(url.href, { assert: { type: 'css' } })
      .then((module) => {
        const styles = module.default;

        for (const [print, sheet] of adoptedStyleSheets) {
          if (print === fingerprint) {
            sheet.replaceSync(getSheetRulesAsString(styles));
          }
        }
      })
      .catch(() => {
        location.reload();
      });
  }

  /**
   * @param { string } href
   */
  function reloadGlobalStyles(href) {
    /** @type { Array<{ link: Node } | { rule: CSSRule, index: number }> } */
    const linksAndImportRules = [];

    for (let i = 0; i < document.styleSheets.length; i++) {
      if (parseStylesheet(document.styleSheets[i], href, linksAndImportRules)) {
        return;
      }
    }

    // No match, possibly a concatenated dependency, so refresh everything
    for (let j = 0; j < linksAndImportRules.length; j++) {
      const linkOrImportRule = linksAndImportRules[j];

      if ('link' in linkOrImportRule) {
        replaceLink(linkOrImportRule.link);
      } else {
        reloadImportRule(
          /** @type { CSSImportRule } */ (linkOrImportRule.rule),
          linkOrImportRule.index,
        );
      }
    }
  }

  /**
   * @param { CSSStyleSheet } stylesheet
   * @param { string } filePath
   * @param { Array<{ link: Node } | { rule: CSSRule, index: number }> } linksAndImportRules
   * @see https://gist.github.com/gabemartin/1183957
   * @returns { boolean }
   */
  function parseStylesheet(stylesheet, filePath, linksAndImportRules) {
    if (stylesheet.href) {
      if (stylesheet.ownerNode) {
        if (filePathMatchesHref(filePath, stylesheet.href, null)) {
          return replaceLink(stylesheet.ownerNode);
        } else {
          linksAndImportRules.push({ link: stylesheet.ownerNode });
        }
      }
    }

    for (let i = 0; i < stylesheet.cssRules.length; i++) {
      const rule = stylesheet.cssRules[i];

      if (ruleIsImportRule(rule)) {
        if (filePathMatchesHref(filePath, rule.href, stylesheet.href)) {
          return reloadImportRule(rule, i);
        } else {
          linksAndImportRules.push({ rule, index: i });
        }
        return parseStylesheet(rule.styleSheet, filePath, linksAndImportRules);
      }
    }

    return false;
  }

  /**
   * @param { CSSRule } rule
   * @returns { rule is CSSImportRule }
   */
  function ruleIsImportRule(rule) {
    return rule.type === CSSRule.IMPORT_RULE;
  }

  /**
   * @param { string } filePath
   * @param { string } href
   * @param { string | null } referrer
   */
  function filePathMatchesHref(filePath, href, referrer) {
    referrer = referrer || location.href;
    const url = new URL(href, referrer);
    return url.origin.includes('localhost') && url.pathname === filePath;
  }

  /**
   * @param { Node } link
   */
  function replaceLink(link) {
    const clone = link.cloneNode(false);
    const parent = link.parentNode;

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

  /**
   * @param { CSSImportRule } rule
   * @param { number } index
   */
  function reloadImportRule(rule, index) {
    const parent = rule.parentStyleSheet;

    if (parent === null) {
      return false;
    }

    parent.insertRule(rule.cssText, index);
    parent.deleteRule(index + 1);

    return true;
  }

  /**
   * @param { CSSStyleSheet } sheet
   */
  function getSheetRulesAsString(sheet) {
    let contents = '';
    for (let i = 0; i < sheet.cssRules.length; i++) {
      contents += sheet.cssRules.item(i)?.cssText;
    }
    return contents;
  }

  /**
   * @param { string } contents
   */
  function getFingerprint(contents) {
    contents = contents.replace(/\W/g, '');
    const digestSize = 2;
    const hashes = new Uint32Array(digestSize).fill(5381);

    for (let i = 0; i < contents.length; i++) {
      hashes[i % digestSize] =
        (hashes[i % digestSize] * 33) ^ contents.charCodeAt(i);
    }

    return btoa(String.fromCharCode(...new Uint8Array(hashes.buffer)));
  }
})();
