import crypto from 'node:crypto';

/**
 * Retrieve process.env polyfill
 */
export function getProcessEnvString(): string {
  return `window.process=window.process||{env:{}};window.process.env.NODE_ENV="${
    process.env.NODE_ENV || 'development'
  }";`;
}

/**
 * Retrieve DVLP global
 */
export function getDvlpGlobalString(): string {
  return 'window.DVLP=true;';
}

/**
 * Retrieve patched "adoptedStyleSheets".
 * This is used to capture all adoptedStyleSheet asignments to enable css hot-reload
 */
export function getPatchedAdoptedStyleSheets(): string {
  return `window.__adoptedStyleSheets__ = { sheets: [], add(sheets) { this.sheets.push(...sheets); } };
for (const proto of [Document.prototype, ShadowRoot.prototype]) {
  const old = Object.getOwnPropertyDescriptor(proto, 'adoptedStyleSheets');
  Object.defineProperty(proto, 'adoptedStyleSheets', {
    set: function (sheets) {
      window.__adoptedStyleSheets__.add(sheets);
      return old.set.call(this, sheets);
    },
  });
}`;
}

/**
 * Concatenate multiple "scripts" into a single string
 */
export function concatScripts(scripts: Array<string>): string {
  return scripts.filter((script) => !!script).join('\n');
}

/**
 * Retrieve sha256 hash of "script"
 */
export function hashScript(script: string): string {
  return crypto.createHash('sha256').update(script).digest('base64');
}
