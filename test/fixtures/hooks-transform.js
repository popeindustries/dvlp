const path = require('path');

module.exports = {
  async onTransform(filePath, code) {
    await sleep(200);
    return `this is transformed content for: ${path.basename(filePath)}`;
  },
  onSend(filePath, code) {},
  onServerTransform(filePath, code) {},
};

function sleep(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
