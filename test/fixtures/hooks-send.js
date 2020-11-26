const path = require('path');

module.exports = {
  onSend(filePath, code) {
    return `this is sent content for: ${path.basename(filePath)}`;
  },
};
