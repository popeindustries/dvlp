const fs = require('fs');
const path = require('path');

module.exports = async function transpiler(filepath) {
  if (path.extname(filepath) !== 'js') {
    return;
  }

  await sleep(200);
  console.log('***transpiled', filepath);
  return fs.readFileSync(filepath, 'utf8');
};

function sleep(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
