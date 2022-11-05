import crypto from 'node:crypto';

/**
 * Retrieve process.env polyfill
 *
 * @returns { string }
 */
export function getProcessEnvString() {
  return `window.process=window.process||{env:{}};window.process.env.NODE_ENV="${
    process.env.NODE_ENV || 'development'
  }";`;
}

/**
 * Retrieve DVLP global
 *
 * @returns { string }
 */
export function getDvlpGlobalString() {
  return 'window.DVLP=true;';
}

/**
 * Retrieve patched "adoptedStyleSheets".
 * This is used to capture all adoptedStyleSheet asignments to enable css hot-reload
 *
 * @returns { string }
 */
export function getPatchedAdoptedStyleSheets() {
  return `customElements.adoptedStyleSheets = { sheets: [], add(sheets) { this.sheets.push(...sheets); } };
const old = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'adoptedStyleSheets');
Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
  set: function (sheets) {
    customElements.adoptedStyleSheets.add(sheets);
    return old.set.call(this, sheets);
  },
});`;
}

/**
 * Concatenate multiple "scripts" into a single string
 *
 * @param { Array<string> } scripts
 * @return { string }
 */
export function concatScripts(scripts) {
  return scripts.filter((script) => !!script).join('\n');
}

/**
 * Retrieve sha256 hash of "script"
 *
 * @param { string } script
 * @returns { string }
 */
export function hashScript(script) {
  return crypto.createHash('sha256').update(script).digest('base64');
}
