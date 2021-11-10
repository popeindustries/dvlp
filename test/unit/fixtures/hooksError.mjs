import path from 'path';

export default {
  onTransform(filePath, code) {
    throw Error(`transform error ${path.basename(filePath)}`);
  },
  onSend(filePath, code) {},
  onServerTransform(filePath, code) {},
};
