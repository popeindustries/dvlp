module.exports = async function transpiler(filepath) {
  await sleep(200);

  return `this is transpiled content for: ${filepath}`;
};

function sleep(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
