const path = require('path');

module.exports = async function transpiler(filePath) {
  throw Error(`transpiler error ${path.basename(filePath)}`);
};
