'use strict';

const config = require('../config.js');
const platform = require('platform');

const ESBUILD_BROWSER_ENGINES = ['chrome', 'edge', 'firefox', 'ios', 'safari'];

module.exports = { parseEsbuildTarget, parseUserAgent };

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

  const { manufacturer, name, os, ua = dvlpUA, version } = platform.parse(
    // Some platforms (Tizen smart-tv) are missing browser name, so assume Chrome
    userAgent.replace(/(Gecko\) )([0-9])/, '$1Chrome/$2'),
  );

  return {
    manufacturer,
    name: name === null ? undefined : name,
    os,
    ua,
    version: version ? version.split('.')[0] : undefined,
  };
}

/**
 * Parse valid esbuild transform target from "platform" instance
 *
 * @param { Platform } platform
 * @returns { string }
 */
function parseEsbuildTarget(platform) {
  const { name = '', os: { family } = {}, version } = platform;
  const engine = family === 'iOS' ? 'ios' : name.split(' ')[0].toLowerCase();

  if (
    !engine ||
    engine === 'dvlp' ||
    !version ||
    !ESBUILD_BROWSER_ENGINES.includes(engine)
  ) {
    return 'es2020';
  }

  return `${engine}${version}`;
}
