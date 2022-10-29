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

  electron.BrowserWindow.prototype.loadFile = function loadFile(filePath, options) {
    const url = new URL(filePath, origin);
    return this.loadURL(url.href);
  };

  process.on('message', async (msg) => {
    if (msg.type === 'start') {
      console.log(msg)
      try {
        await import('${entryPath}');
        process.send({ type: 'started' });
      } catch (err) {
        console.log(err);
        throw err;
      }
    }
  })
  `;
}
