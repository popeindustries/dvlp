const path = require('path');

module.exports = async function transpiler(filepath) {
  await sleep(200);

  return `this is transpiled content for: ${path.basename(filepath)}`;
};

function sleep(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
