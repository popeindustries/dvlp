'use strict';

const config = require('../config.js');
const platform = require('platform');

module.exports = { parseUserAgent };

/**
 * Parse platform information from User-Agent
 *
 * @param { string } [userAgent]
 * @returns { Platform }
 */
function parseUserAgent(userAgent) {
  const dvlpUA = `dvlp/${config.version} (+https://github.com/popeindustries/dvlp)`;

  if (!userAgent) {
    return {
      manufacturer: 'Popeindustries',
      name: 'dvlp',
      ua: dvlpUA,
      version: config.version,
    };
  }

  const { manufacturer, name, ua = dvlpUA, version } = platform.parse(
    // Some platforms (Tizen smart-tv) are missing browser name, so assume Chrome
    userAgent.replace(/(Gecko\) )([0-9])/, '$1Chrome/$2'),
  );

  return {
    manufacturer,
    name,
    ua,
    version: version ? version.split('.')[0] : undefined,
  };
}
