(function () {
  if (typeof URL === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }
  const INIT_RECONNECT_TIMEOUT = 1000;
  const MAX_RECONNECT_TIMEOUT = 16000;
  const RE_CSS_FILE_PATH = /--__dvlp-file-path__:\s"([^"]+)"/;
  const RELOAD_STATE_KEY = 'dvlp:reloadState';
  const RELOAD_STATE_MAX_AGE = 30000;
  const RESTORE_RETRY_INTERVAL = 100;
  const RESTORE_TIMEOUT = 3000;
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

  restoreReloadState();

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
    navigator.locks.request(
      'dvlp/reload',
      { ifAvailable: false, mode: 'exclusive' },
      (lock) => {
        callback(lock !== null);
        // Never relinquish until process exit
        return new Promise(() => {});
      },
    );
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
    try {
      saveReloadState();
    } catch {
      // sessionStorage unavailable
    }
    location.reload();
  }

  /**
   * Stash scroll position, focus, and form field state before a full reload
   */
  function saveReloadState() {
    /** @type { Array<{ checked: boolean, selector: string, value: string }> } */
    const fields = [];
    const fieldElements = document.querySelectorAll('input, textarea, select');

    for (let i = 0; i < fieldElements.length; i++) {
      const el = /** @type { HTMLInputElement } */ (fieldElements[i]);
      const selector = getFieldSelector(el);

      if (
        selector !== undefined &&
        el.type !== 'password' &&
        el.type !== 'file'
      ) {
        fields.push({ checked: el.checked, selector, value: el.value });
      }
    }

    sessionStorage.setItem(
      RELOAD_STATE_KEY,
      JSON.stringify({
        fields,
        focus:
          document.activeElement instanceof HTMLElement
            ? getFieldSelector(document.activeElement)
            : undefined,
        href: location.href,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        time: Date.now(),
      }),
    );
  }

  /**
   * Restore state stashed by saveReloadState(), retrying for a few seconds
   * to allow js-rendered content to appear
   */
  function restoreReloadState() {
    /** @type { { fields: Array<{ checked: boolean, selector: string, value: string }>, focus?: string, href: string, scrollX: number, scrollY: number, time: number } } */
    let state;

    try {
      const stored = sessionStorage.getItem(RELOAD_STATE_KEY);

      if (stored === null) {
        return;
      }
      sessionStorage.removeItem(RELOAD_STATE_KEY);
      state = JSON.parse(stored);
    } catch {
      return;
    }

    if (
      state.href !== location.href ||
      Date.now() - state.time > RELOAD_STATE_MAX_AGE
    ) {
      return;
    }

    const deadline = Date.now() + RESTORE_TIMEOUT;
    let pendingFields = state.fields;
    let pendingFocus = state.focus;
    let pendingScroll = state.scrollX !== 0 || state.scrollY !== 0;

    const attempt = () => {
      /** @type { Array<{ checked: boolean, selector: string, value: string }> } */
      const remaining = [];

      for (const field of pendingFields) {
        const el = /** @type { HTMLInputElement | null } */ (
          document.querySelector(field.selector)
        );

        if (el === null) {
          remaining.push(field);
          continue;
        }
        if (el.value !== field.value || el.checked !== field.checked) {
          el.value = field.value;
          el.checked = field.checked;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      pendingFields = remaining;

      if (pendingFocus !== undefined) {
        const el = document.querySelector(pendingFocus);

        if (el instanceof HTMLElement) {
          el.focus();
          pendingFocus = undefined;
        }
      }

      if (pendingScroll) {
        // Wait until the (possibly js-rendered) page is tall enough
        if (
          document.documentElement.scrollHeight >=
          state.scrollY + window.innerHeight
        ) {
          window.scrollTo(state.scrollX, state.scrollY);
          pendingScroll = false;
        }
      }

      if (
        (pendingFields.length > 0 ||
          pendingFocus !== undefined ||
          pendingScroll) &&
        Date.now() < deadline
      ) {
        setTimeout(attempt, RESTORE_RETRY_INTERVAL);
      } else if (pendingScroll) {
        // Give up waiting for content height and scroll as far as possible
        window.scrollTo(state.scrollX, state.scrollY);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attempt);
    } else {
      attempt();
    }
  }

  /**
   * Retrieve a selector uniquely identifying form field "el",
   * or "undefined" if none exists
   * @param { HTMLElement } el
   */
  function getFieldSelector(el) {
    /** @type { string | undefined } */
    let selector;

    if (el.id) {
      selector = '#' + CSS.escape(el.id);
    } else if ('name' in el && typeof el.name === 'string' && el.name) {
      selector =
        el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]';
    } else {
      return undefined;
    }

    return document.querySelectorAll(selector).length === 1
      ? selector
      : undefined;
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
      const { assert, filePath, href, type } =
        /** @type { import('../utils/types.ts').RequestContext } */ (
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

    import(url.href, { with: { type: 'css' } })
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
