'use strict';

const fs = require('fs');
const sass = require('sass');
const sucrase = require('sucrase');

const RE_SASS = /\.s[ac]ss$/;
const RE_TS = /\.tsx?$/;

module.exports = async function transpile(filepath) {
  if (RE_SASS.test(filepath)) {
    return sass.renderSync({
      file: filepath,
    }).css;
  } else if (RE_TS.test(filepath)) {
    return sucrase.transform(fs.readFileSync(filepath, 'utf8'), {
      transforms: ['typescript', 'jsx'],
    }).code;
  }
};
