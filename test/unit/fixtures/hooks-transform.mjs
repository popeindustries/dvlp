import path from 'path';

export default {
  async onTransform(filePath, code, context) {
    await sleep(200);
    return `this is transformed content for: ${path.basename(filePath)} on ${context.client.name}:${
      context.client.version
    }`;
  },
};

function sleep(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
