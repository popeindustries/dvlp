const fs = require('fs');
const path = require('path');

module.exports = async function transpiler(filePath) {
  if (path.extname(filePath) !== '.js') {
    return '';
  }

  await sleep(200);
  console.log('***transpiled', filePath);
  return fs.readFileSync(filePath, 'utf8');
};

function sleep(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
