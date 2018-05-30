const path = require('path');

module.exports = async function transpiler(filepath) {
  throw Error(`transpiler error ${path.basename(filepath)}`);
};
