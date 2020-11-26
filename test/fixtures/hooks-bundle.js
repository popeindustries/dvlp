const path = require('path');

module.exports = {
  onDependencyBundle(filePath, code) {
    return `this is bundled content for: ${path.basename(filePath)}`;
  },
};
