const path = require('path');

module.exports = async function transpiler(filePath) {
  await sleep(200);

  return `this is transpiled content for: ${path.basename(filePath)}`;
};

function sleep(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
