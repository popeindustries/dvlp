const path = require('path');

module.exports = {
  onDependencyBundle(id, filePath) {
    return `this is bundled content for: ${path.basename(filePath)}`;
  },
};
