(function () {
  if (typeof URL === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }
  const INIT_RECONNECT_TIMEOUT = 1000;
  const MAX_RECONNECT_TIMEOUT = 16000;
  const RE_CSS_FILE_PATH = /--__dvlp-file-path__:\s"([^"]+)"/;
  const canUseLeaderElection =
    typeof BroadcastChannel !== 'undefined' &&
    typeof navigator.locks !== 'undefined';
  /** @type { BroadcastChannel } */
  let channel;
  let isConnected = false;
  let isLeader = false;
  let currentReconnectTimeout = INIT_RECONNECT_TIMEOUT;
  let reconnectAttempts = 100;
  let reconnectTimeoutId = 0;
  /** @type { EventSource } */
  let sse;
  const url = new URL(location.protocol + '//' + location.hostname);
  url.pathname = '$RELOAD_PATHNAME';
  if (location.port) {
    url.port = location.port;
  }

  /** @type { { sheets: Array<CSSStyleSheet>, add(sheets: Array<CSSStyleSheet>): void } } */
  // @ts-expect-error - patched
  const adoptedStyleSheetsCollector = window.__adoptedStyleSheets__;
  /** @type { Map<string, CSSStyleSheet> } */
  const adoptedStyleSheets = new Map();

  adoptedStyleSheetsCollector.add = function add(sheets) {
    for (const sheet of sheets) {
      const filePath = getFilePathFromSheetString(getSheetRulesAsString(sheet));

      if (filePath !== undefined) {
        adoptedStyleSheets.set(filePath, sheet);
      }
    }
  };

  adoptedStyleSheetsCollector.add(adoptedStyleSheetsCollector.sheets);
  adoptedStyleSheetsCollector.sheets = [];

  if (!canUseLeaderElection) {
    connect();
  } else {
    channel = new BroadcastChannel('dvlp/reload');
    channel.onmessage = (event) => {
      if (event.data.type === 'reload') {
        onReload();
      } else if (event.data.type === 'refresh') {
        onRefresh(event.data.event);
      }
    };

    requestLeadership((success) => {
      if (success) {
        isLeader = true;
        connect();
      }
    });
  }

  /**
   * @param {(success: boolean) => void} callback
   */
  function requestLeadership(callback) {
    /** @type {() => void} */
    let resolve;
    /** @type {Promise<void>} */
    const promise = new Promise((r) => (resolve = r));

    navigator.locks.request(
      'dvlp/reload',
      { ifAvailable: false, mode: 'exclusive' },
      (lock) => {
        callback(lock !== null);
        return promise;
      },
    );

    // Relinquish leadership when called, otherwise automatically relinquished when process exits
    return () => resolve();
  }

  function connect() {
    clearTimeout(reconnectTimeoutId);
    sse = new EventSource(url.href);
    sse.addEventListener('open', onOpen);
    sse.addEventListener('error', onError);
    sse.addEventListener('reload', onReload);
    sse.addEventListener('refresh', onRefresh);
  }

  function onOpen() {
    clearTimeout(reconnectTimeoutId);
    // Force reload after server restart
    if (isConnected) {
      onReload();
    }
    isConnected = true;
    currentReconnectTimeout = INIT_RECONNECT_TIMEOUT;
  }

  function onError() {
    sse.close();
    if (--reconnectAttempts > 0) {
      reconnectTimeoutId = window.setTimeout(connect, currentReconnectTimeout);
      // Exponential backoff
      if (currentReconnectTimeout < MAX_RECONNECT_TIMEOUT) {
        currentReconnectTimeout *= 2;
      }
    }
  }

  function onReload() {
    if (isLeader) {
      channel.postMessage({ type: 'reload' });
    }
    location.reload();
  }

  /**
   * @param {MessageEvent} event
   */
  function onRefresh(event) {
    if (isLeader) {
      channel.postMessage({
        type: 'refresh',
        event: { type: 'message', data: event.data },
      });
    }

    try {
      const { assert, filePath, href, type } = /** @type { RequestContext } */ (
        JSON.parse(event.data)
      );

      if (type === 'css') {
        if (assert === 'css') {
          if (filePath !== undefined) {
            reloadAdoptedStyles(href, filePath);
          } else {
            throw Error('missing filePath');
          }
        } else {
          reloadGlobalStyles(href);
        }
      } else {
        throw Error('unsuported refresh type');
      }
    } catch {
      location.reload();
    }
  }

  /**
   * @param { string } href
   * @param { string } filePath
   */
  function reloadAdoptedStyles(href, filePath) {
    const url = new URL(href, location.origin);
    url.searchParams.set('t', String(Date.now()));

    import(url.href, { assert: { type: 'css' } })
      .then((module) => {
        const styles = module.default;

        for (const [fp, sheet] of adoptedStyleSheets) {
          if (fp === filePath) {
            const string = getSheetRulesAsString(styles);
            sheet.replaceSync(string);
            adoptedStyleSheets.set(fp, sheet);
            break;
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
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];

      if (parseStylesheet(sheet, href, sheet)) {
        return;
      }
    }

    // No match, possibly a concatenated dependency, so refresh everything
    for (let i = 0; i < document.styleSheets.length; i++) {
      reloadLink(document.styleSheets[i].ownerNode);
    }
  }

  /**
   * @param { CSSStyleSheet } stylesheet
   * @param { string } href
   * @param { CSSStyleSheet } rootStylesheet
   * @returns { boolean }
   */
  function parseStylesheet(stylesheet, href, rootStylesheet) {
    if (
      stylesheet.href &&
      stylesheet.ownerNode &&
      hrefMatches(href, stylesheet.href, null)
    ) {
      return reloadLink(stylesheet.ownerNode);
    }

    for (let i = 0; i < stylesheet.cssRules.length; i++) {
      const rule = stylesheet.cssRules[i];

      if (ruleIsImportRule(rule)) {
        if (hrefMatches(href, rule.href, stylesheet.href)) {
          return reloadLink(rootStylesheet.ownerNode);
        }
        return parseStylesheet(
          /** @type { CSSStyleSheet } */ (rule.styleSheet),
          href,
          rootStylesheet,
        );
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
   * @param { string } newHref
   * @param { string } oldHref
   * @param { string | null } referrer
   */
  function hrefMatches(newHref, oldHref, referrer) {
    referrer = referrer || location.origin;
    const url = new URL(oldHref, referrer);
    // Ignore searchParams
    return url.origin.includes('localhost') && url.pathname === newHref;
  }

  /**
   * @param { unknown } link
   */
  function reloadLink(link) {
    if (link instanceof Element && link.hasAttribute('href')) {
      const url = new URL(
        /** @type { string } */ (link.getAttribute('href')),
        location.origin,
      );
      url.searchParams.set('t', String(Date.now()));

      if (link.parentNode) {
        link.setAttribute('href', url.href);
        return true;
      }
    }

    return false;
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
   * @param { string } string
   */
  function getFilePathFromSheetString(string) {
    return RE_CSS_FILE_PATH.exec(string)?.[1].replace(/\\\\/g, '\\');
  }
})();
