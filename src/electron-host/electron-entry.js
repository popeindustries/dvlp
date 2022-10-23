const t = String.raw;

/**
 *  Generate electron-entry file contents
 *
 * @param { string } entryPath
 * @param { string } origin
 */
export function getEntryContents(entryPath, origin) {
  return t`
  const electron = require('electron');
  const origin = '${origin}';

  console.log(electron)

  // electron.BrowserWindow.prototype.loadFile = function loadFile(filePath, options) {
  //   const url = new URL(filePath, origin);
  //   return this.loadURL(url.href);
  // };

  // import('${entryPath}');`;
}
