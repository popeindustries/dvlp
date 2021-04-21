const path = require('path');

module.exports = {
  onTransform(filePath, code) {
    throw Error(`transform error ${path.basename(filePath)}`);
  },
  onSend(filePath, code) {},
  onServerTransform(filePath, code) {},
};
