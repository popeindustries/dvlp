const fs = require('fs');
const sucrase = require('sucrase');

module.exports = function transpiler(filePath, isServer) {
  if (isServer) {
    if (/jsx$/.test(filePath)) {
      return sucrase.transform(fs.readFileSync(filePath, 'utf8'), {
        transforms: ['jsx']
      }).code;
    }
  }
};
