const path = require('path');

module.exports = {
  onTransform(filePath, code) {},
  onSend(filePath, code) {
    return `this is sent content for: ${path.basename(filePath)}`;
  },
  onServerTransform(filePath, code) {},
};

function sleep(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
